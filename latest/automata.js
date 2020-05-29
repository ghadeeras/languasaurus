import * as charsets from './charsets.js';
import * as utils from './utils.js';
export function state(...recognizables) {
    return State.create(...recognizables);
}
export function automaton(start) {
    return Automaton.create(start);
}
export function choice(automaton, ...automata) {
    return Automaton.choice(automaton, ...automata);
}
export function concat(automaton, ...automata) {
    return Automaton.concat(automaton, ...automata);
}
export class Automaton {
    constructor(states) {
        this._states = utils.unique(states);
        this._transientStates = this._states.filter(state => state.isTransient);
        this._finalStates = this._states.filter(state => state.isFinal);
        this.startState = this._states[0];
    }
    get isOptional() {
        return this.startState.isFinal;
    }
    get states() {
        return [...this._states];
    }
    get transientStates() {
        return [...this._states];
    }
    get finalStates() {
        return [...this._states];
    }
    newMatcher() {
        return new AutomatonMatcher(this.startState);
    }
    toString() {
        let result = "";
        for (let i = 0; i < this._states.length; i++) {
            const state = this._states[i];
            const finalTag = state.isFinal ? '(final)' : '';
            result += `state #${i} ${finalTag}:\n`;
            for (const transition of state.transitions) {
                result += `\t on ${transition.trigger} --> state #${this._states.indexOf(transition.target)} \n`;
            }
        }
        return result;
    }
    deterministic() {
        const ndf = this.cloneNoDuplicates();
        const df = Automaton.create(ClosureState.startStateOf(ndf));
        return df.cloneNoDuplicates();
    }
    optional() {
        if (this.isOptional) {
            return this;
        }
        const newStartState = Automaton.unionState(this._finalStates);
        const clone = this.clone();
        for (const transition of clone.startState.transitions) {
            newStartState.on(transition.trigger, transition.target);
        }
        return Automaton.create(newStartState);
    }
    repeated() {
        const draft = this.clone();
        for (const finalState of draft._finalStates) {
            for (const transition of draft.startState.transitions) {
                finalState.on(transition.trigger, transition.target);
            }
        }
        return Automaton.create(draft.startState);
    }
    clone(stateCloner = s => Automaton.state(s)) {
        return this.mapStates(stateCloner);
    }
    map(mapper) {
        return this.mapStates(state => State.create(...state.recognizables.map(mapper)));
    }
    mapStates(stateMapper) {
        var _a;
        const map = new Map();
        const mappedStates = this._states.map((state, index) => {
            map.set(state, index);
            return stateMapper(state, index);
        });
        for (let i = 0; i < this._states.length; i++) {
            const state = this._states[i];
            const clone = mappedStates[i];
            for (const transition of state.transitions) {
                const index = (_a = map.get(transition.target)) !== null && _a !== void 0 ? _a : utils.bug();
                clone.on(transition.trigger, mappedStates[index]);
            }
        }
        return new Automaton(mappedStates);
    }
    static choice(automaton, ...automata) {
        automata.unshift(automaton);
        const startState = Automaton.unionState(automata.map(a => a.startState));
        for (const automaton of automata) {
            const clone = automaton.clone();
            for (const transition of clone.startState.transitions) {
                startState.on(transition.trigger, transition.target);
            }
        }
        return Automaton.create(startState);
    }
    static concat(automaton, ...automata) {
        automata.unshift(automaton);
        const lastNonOptional = automata.reduce((max, automaton, index) => !automaton.isOptional && index > max ? index : max, -1);
        const startState = lastNonOptional <= -1 ? Automaton.state(automaton.startState) : State.create();
        let jointStates = [startState];
        for (let i = 0; i < automata.length; i++) {
            jointStates = Automaton.append(automata[i], jointStates, i >= lastNonOptional);
        }
        return Automaton.create(startState);
    }
    static create(start) {
        return new Automaton(this.allStatesFrom(start));
    }
    static append(automaton, prevStates, optional) {
        const nextStates = automaton.isOptional ? [...prevStates] : [];
        const cloner = state => {
            const clone = optional ? Automaton.state(state) : State.create();
            if (state.isFinal) {
                nextStates.push(clone);
            }
            return clone;
        };
        const clonedAutomaton = automaton.clone(cloner);
        for (const prevState of prevStates) {
            for (const transition of clonedAutomaton.startState.transitions) {
                prevState.on(transition.trigger, transition.target);
            }
        }
        return nextStates;
    }
    static allStatesFrom(start) {
        const result = [];
        Automaton.traverse(start, state => result.push(state));
        return result;
    }
    static traverse(state, consumer) {
        this.doTraverse(state, new Set(), consumer);
    }
    static doTraverse(state, visitedStates, consumer) {
        if (!visitedStates.has(state)) {
            visitedStates.add(state);
            consumer(state);
            for (const transition of state.transitions) {
                Automaton.doTraverse(transition.target, visitedStates, consumer);
            }
        }
    }
    cloneNoDuplicates() {
        let oldSize = this._states.length;
        this.reorganizeTriggerOverlaps();
        let automaton = this.cloneNoShallowDuplicates();
        let newSize = automaton._states.length;
        while (newSize < oldSize) {
            oldSize = newSize;
            automaton.reorganizeTriggerOverlaps();
            automaton = automaton.cloneNoShallowDuplicates();
            newSize = automaton._states.length;
        }
        return automaton;
    }
    reorganizeTriggerOverlaps() {
        this._states.forEach(s => s.reorganizeTriggerOverlaps());
    }
    cloneNoShallowDuplicates() {
        const visitedStates = [];
        const clonedStates = [];
        const cloner = state => {
            let index = visitedStates.findIndex(s => s.identicalTo(state));
            if (index < 0) {
                visitedStates.push(state);
                clonedStates.push(Automaton.state(state));
                index = clonedStates.length - 1;
            }
            return clonedStates[index];
        };
        return this.clone(cloner);
    }
    static state(state) {
        return State.create(...state.recognizables);
    }
    static unionState(states) {
        return State.create(...utils.flatMap(states, state => state.recognizables));
    }
}
class AutomatonMatcher {
    constructor(start) {
        this.start = start;
        this._current = start;
        this._lastRecognized = this._recognized = start.recognizables;
    }
    reset() {
        this._current = this.start;
        this._lastRecognized = this._recognized = this.start.recognizables;
    }
    get lastRecognized() {
        return [...this._lastRecognized];
    }
    get recognized() {
        return [...this._recognized];
    }
    match(char) {
        for (const transition of this._current.transitions) {
            const nextState = transition.apply(char);
            if (nextState != null) {
                this.transitionTo(nextState);
                return true;
            }
        }
        return false;
    }
    randomMatch() {
        if (this._current.transitions.length == 0) {
            return null;
        }
        const index = utils.randomInt(this._current.transitions.length);
        const transition = this._current.transitions[index];
        this.transitionTo(transition.target);
        return transition.trigger.random();
    }
    transitionTo(nextState) {
        this._current = nextState;
        this._recognized = nextState.recognizables;
        if (this._recognized.length > 0) {
            this._lastRecognized = this._recognized;
        }
    }
}
export class State {
    constructor(recognizables) {
        this._transitions = [];
        this._recognizables = recognizables;
    }
    get recognizables() {
        return [...this._recognizables];
    }
    get transitions() {
        return [...this._transitions];
    }
    get isFinal() {
        return this._recognizables.length > 0;
    }
    get isTransient() {
        return !this.isFinal;
    }
    reorganizeTriggerOverlaps() {
        const triggers = this._transitions.map(t => t.trigger);
        const targets = this._transitions.map(t => t.target);
        const overlaps = charsets.computeOverlaps(...triggers);
        this._transitions.splice(0);
        for (const overlap of overlaps) {
            for (const range of overlap.value.ranges) {
                for (const i of overlap.key) {
                    this.on(charsets.range(range.min, range.max), targets[i], false);
                }
            }
        }
    }
    onCharFrom(chars, target) {
        return this.on(charsets.chars(chars), target);
    }
    onCharIn(range, target) {
        return this.on(charsets.range(range.charCodeAt(0), range.charCodeAt(range.length - 1)), target);
    }
    onCharNotFrom(chars, target) {
        return this.on(charsets.complement(charsets.chars(chars)), target);
    }
    onCharOutOf(range, target) {
        return this.on(charsets.complement(charsets.range(range.charCodeAt(0), range.charCodeAt(range.length - 1))), target);
    }
    on(trigger, target, optimized = true) {
        const index = optimized ? this._transitions.findIndex(t => t.target == target) : -1;
        if (index < 0) {
            this._transitions.push(new Transition(trigger, target));
        }
        else {
            const existingTrigger = this._transitions[index].trigger;
            this._transitions[index] = new Transition(charsets.union(existingTrigger, trigger), target);
        }
        return this;
    }
    identicalTo(that) {
        const result = this === that ||
            this._recognizables.length == that._recognizables.length &&
                this._recognizables.every(thisR => that._recognizables.findIndex(thatR => thisR === thatR) >= 0) &&
                this._transitions.length == that._transitions.length &&
                this._transitions.every(thisT => that._transitions.findIndex(thatT => thisT.identicalTo(thatT)) >= 0);
        return result;
    }
    static create(...recognizables) {
        return new State(utils.unique(recognizables));
    }
}
class Transition {
    constructor(trigger, target) {
        this.trigger = trigger;
        this.target = target;
    }
    apply(char) {
        return this.trigger.contains(char) ? this.target : null;
    }
    identicalTo(that) {
        return this.target === that.target && identical(this.trigger, that.trigger);
    }
}
class ClosureState extends State {
    constructor(automaton, stateIndexes) {
        super(utils.unique(utils.flatMap(stateIndexes, index => automaton.states[index].recognizables)));
        this.automaton = automaton;
        this.stateIndexes = stateIndexes;
    }
    static startStateOf(automaton) {
        return ClosureState.enclose(automaton, [0], []);
    }
    static enclose(automaton, stateIndexes, closures) {
        const closure = new ClosureState(automaton, utils.unique(stateIndexes).sort());
        const comparator = utils.comparing(state => state.stateIndexes, utils.arrayComparator(utils.numberComparator));
        const identicalClosure = closures.find(c => comparator(c, closure) == 0);
        return identicalClosure || ClosureState.init(closure, automaton, closures);
    }
    static init(closure, automaton, closures) {
        closures.push(closure);
        const states = closure.stateIndexes.map(index => automaton.states[index]);
        const transitions = ClosureState.nonOverlappingTransitions(states);
        const groupedTransitions = utils.group(transitions, t => t.trigger, t => t.target, charSetComparator);
        for (const transition of groupedTransitions) {
            const targetIndexes = transition.value.map(target => automaton.states.indexOf(target));
            closure.on(transition.key, ClosureState.enclose(automaton, targetIndexes, closures));
        }
        return closure;
    }
    static nonOverlappingTransitions(states) {
        const transitions = utils.flatMap(states, state => state.transitions);
        const tempState = State.create();
        for (const transition of transitions) {
            tempState.on(transition.trigger, transition.target, false);
        }
        tempState.reorganizeTriggerOverlaps();
        return tempState.transitions;
    }
}
const rangeComparator = utils.comparingBy(utils.comparing(r => r.min, utils.numberComparator), utils.comparing(r => r.max, utils.numberComparator));
const charSetComparator = utils.comparing(set => set.ranges, utils.arrayComparator(rangeComparator));
function identical(set1, set2) {
    return charSetComparator(set1, set2) == 0;
}