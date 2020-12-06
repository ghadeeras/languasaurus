import * as charsets from './charsets.js'
import * as utils from './utils.js'

type StateMapper<R1, R2> = utils.Mapper<State<R1>, State<R2>>
type StateCloner<R> = StateMapper<R, R>

export interface Matcher<R> {

    lastRecognized: R[]

    recognized: R[]

    match(char: number): boolean

    randomMatch(): number | null

    reset(): void

}

export function state<R>(...recognizables: R[]): State<R> {
    return State.create(...recognizables)
}

export function automaton<R>(start: State<R>): Automaton<R> {
    return Automaton.create(start)
}

export function choice<R>(automaton: Automaton<R>, ...automata: Automaton<R>[]): Automaton<R> {
    return Automaton.choice(automaton, ...automata)
}

export function concat<R>(automaton: Automaton<R>, ...automata: Automaton<R>[]): Automaton<R> {
    return Automaton.concat(automaton, ...automata)
}

export class Automaton<R> {

    private _states: State<R>[]
    private _transientStates: State<R>[]
    private _finalStates: State<R>[]
    readonly startState: State<R>

    private constructor(states: State<R>[]) {
        this._states = utils.unique(states)
        this._transientStates = this._states.filter(state => state.isTransient)
        this._finalStates = this._states.filter(state => state.isFinal)
        this.startState = this._states[0]
    }

    get isOptional(): boolean {
        return this.startState.isFinal
    }

    get states() {
        return [...this._states]
    }

    get transientStates() {
        return [...this._states]
    }

    get finalStates() {
        return [...this._states]
    }

    newMatcher(): Matcher<R> {
        return new AutomatonMathcer(this.startState)
    }

    toString(): string {
        let result = ""
        for (let i = 0; i < this._states.length; i++) {
            const state = this._states[i]
            const finalTag = state.isFinal ? '(final)' : ''
            result += `state #${i} ${finalTag}:\n`
            for (let transition of state.transitions) {
                result += `\t on ${transition.trigger} --> state #${this._states.indexOf(transition.target)} \n`
            }
        }
        return result 
    }

    deterministic(): Automaton<R> {
        const ndf = this.cloneNoDuplicates()
        const df = Automaton.create(ClosureState.startStateOf(ndf))
        return df.cloneNoDuplicates()
    }

    optional(): Automaton<R> {
        if (this.isOptional) {
            return this
        }
        const newStartState = Automaton.unionState(this._finalStates)
        const clone = this.clone()
        for (let transition of clone.startState.transitions) {
            newStartState.on(transition.trigger, transition.target)
        }
        return Automaton.create(newStartState)
    }

    repeated(): Automaton<R> {
        const draft = this.clone()
        for (let finalState of draft._finalStates) {
            for (let transition of draft.startState.transitions) {
                finalState.on(transition.trigger, transition.target)
            }
        }
        return Automaton.create(draft.startState)
    }

    clone(stateCloner: StateCloner<R> = s => Automaton.state(s)): Automaton<R> {
        return this.mapStates(stateCloner)
    }

    map<RR>(mapper: utils.Mapper<R, RR>): Automaton<RR> {
        return this.mapStates(state => State.create(...state.recognizables.map(mapper)))
    }

    mapStates<RR>(stateMapper: StateMapper<R, RR>): Automaton<RR> {
        const map: Map<State<R>, number> = new Map()
        let mappedStates: State<RR>[] = this._states.map((state, index) => {
            map.set(state, index)
            return stateMapper(state, index)
        })
        for (let i = 0; i < this._states.length; i++) {
            const state = this._states[i]
            const clone = mappedStates[i]
            for (let transition of state.transitions) {
                const index: number = map.get(transition.target) ?? utils.bug()
                clone.on(transition.trigger, mappedStates[index])
            }
        }
        return new Automaton(mappedStates)
    }

    static choice<R>(automaton: Automaton<R>, ...automata: Automaton<R>[]): Automaton<R> {
        automata.unshift(automaton)
        const startState: State<R> = Automaton.unionState(automata.map(a => a.startState))
        for (let automaton of automata) {
            const clone = automaton.clone()
            for (let transition of clone.startState.transitions) {
                startState.on(transition.trigger, transition.target)
            }
        }
        return Automaton.create(startState)
    }

    static concat<R>(automaton: Automaton<R>, ...automata: Automaton<R>[]): Automaton<R> {
        automata.unshift(automaton)
        const lastNonOptional = automata.reduce((max, automaton, index) => !automaton.isOptional && index > max ? index : max, -1)
        const startState: State<R> = lastNonOptional <= -1 ? Automaton.state(automaton.startState) : State.create()
        let jointStates: State<R>[] = [startState]
        for (let i = 0; i < automata.length; i++) {
            jointStates = Automaton.append(automata[i], jointStates, i >= lastNonOptional)
        }
        return Automaton.create(startState)
    }

    static create<R>(start: State<R>) {
        return new Automaton(this.allStatesFrom(start))
    } 

    private static append<R>(automaton: Automaton<R>, prevStates: State<R>[], optional: boolean) {
        const nextStates: State<R>[] = automaton.isOptional ? [...prevStates] : []
        const cloner: StateCloner<R> = state => {
            const clone: State<R> = optional ? Automaton.state(state) : State.create()
            if (state.isFinal) {
                nextStates.push(clone)
            }
            return clone
        }
        const clonedAutomaton = automaton.clone(cloner)
        for (let prevState of prevStates) {
            for (let transition of clonedAutomaton.startState.transitions) {
                prevState.on(transition.trigger, transition.target)
            }
        }
        return nextStates
    }

    private static allStatesFrom<R>(start: State<R>): State<R>[] {
        const result: State<R>[] = []
        Automaton.traverse(start, state => result.push(state))
        return result
    }

    private static traverse<R>(state: State<R>, consumer: utils.Consumer<State<R>>) {
        this.doTraverse(state, new Set(), consumer)
    }

    private static doTraverse<R>(state: State<R>, vistedStates: Set<State<R>>, consumer: utils.Consumer<State<R>>) {
        if (!vistedStates.has(state)) {
            vistedStates.add(state)
            consumer(state)
            for (let transition of state.transitions) {
                Automaton.doTraverse(transition.target, vistedStates, consumer)
            }
        }
    }

    private cloneNoDuplicates(): Automaton<R> {
        let oldSize = this._states.length
        this.reorganizeTriggerOverlaps()
        let automaton = this.cloneNoShallowDuplicates()
        let newSize = automaton._states.length
        while (newSize < oldSize) {
            oldSize = newSize
            automaton.reorganizeTriggerOverlaps()
            automaton = automaton.cloneNoShallowDuplicates()
            newSize = automaton._states.length
        }
        return automaton
    }

    private reorganizeTriggerOverlaps() {
        this._states.forEach(s => s.reorganizeTriggerOverlaps())
    }

    private cloneNoShallowDuplicates() {
        const visitedStates: State<R>[] = []
        const clonedStates: State<R>[] = []
        const cloner: StateCloner<R> = state => {
            let index = visitedStates.findIndex(s => s.identicalTo(state))
            if (index < 0) {
                visitedStates.push(state)
                clonedStates.push(Automaton.state(state))
                index = clonedStates.length - 1
             }
             return clonedStates[index]
        }
        return this.clone(cloner)
    }    

    private static state<R>(state: State<R>): State<R> {
        return State.create(...state.recognizables)
    }

    private static unionState<R>(states: State<R>[]): State<R> {
        return State.create(...utils.flatMap(states, state => state.recognizables))
    }

}

class AutomatonMathcer<R> implements Matcher<R> {

    private _current: State<R>
    private _lastRecognized: R[]
    private _recognized: R[]
    
    constructor(private start: State<R>) {
        this._current = start
        this._lastRecognized = this._recognized = start.recognizables
    }

    reset(): void {
        this._current = this.start
        this._lastRecognized = this._recognized = this.start.recognizables
    }

    get lastRecognized() {
        return [...this._lastRecognized]
    }

    get recognized() {
        return [...this._recognized]
    }

    match(char: number): boolean {
        for (let transition of this._current.transitions) {
            const nextState = transition.apply(char)
            if (nextState != null) {
                this.transitionTo(nextState)
                return true
            }
        }
        return false
    }
    
    randomMatch(): number | null {
        if (this._current.transitions.length == 0) {
            return null
        }
        const index = utils.randomInt(this._current.transitions.length)
        const transition = this._current.transitions[index]
        this.transitionTo(transition.target)
        return transition.trigger.random()
    }

    private transitionTo(nextState: State<R>) {
        this._current = nextState
        this._recognized = nextState.recognizables
        if (this._recognized.length > 0) {
            this._lastRecognized = this._recognized
        }
    }

}

export class State<R> {

    private _recognizables: R[]
    private _transitions: Transition<R>[] = []

    protected constructor(recognizables: R[]) {
        this._recognizables = recognizables
    }

    get recognizables() {
        return [...this._recognizables]
    }

    get transitions() {
        return [...this._transitions]
    }

    get isFinal(): boolean {
        return this._recognizables.length > 0
    }

    get isTransient(): boolean {
        return !this.isFinal
    }

    reorganizeTriggerOverlaps() {
        const triggers = this._transitions.map(t => t.trigger)
        const targets = this._transitions.map(t => t.target)
        const overlaps = charsets.computeOverlaps(...triggers)
        this._transitions.splice(0)
        for (let overlap of overlaps) {
            for (let range of overlap.value.ranges) {
                for (let i of overlap.key) {
                    this.on(charsets.range(range.min, range.max), targets[i], false)
                }
            }
        }
    }

    on(trigger: charsets.CharSet, target: State<R>, optimized: boolean = true): State<R> {
        const index = optimized ? this._transitions.findIndex(t => t.target == target) : -1
        if (index < 0) {
            this._transitions.push(new Transition(trigger, target))
        } else {
            const existingTrigger = this._transitions[index].trigger
            this._transitions[index] = new Transition(charsets.union(existingTrigger, trigger), target)
        }
        return this
    }

    identicalTo(that: State<R>): boolean {
        const result = this === that || 
            this._recognizables.length == that._recognizables.length && 
            this._recognizables.every(thisR => that._recognizables.findIndex(thatR => thisR === thatR) >= 0) && 
            this._transitions.length == that._transitions.length && 
            this._transitions.every(thisT => that._transitions.findIndex(thatT => thisT.identicalTo(thatT)) >= 0)
        return result
    }

    static create<R>(...recognizables: R[]): State<R> {
        return new State(utils.unique<R>(recognizables))
    }

}

class Transition<R> {

    constructor(
        readonly trigger: charsets.CharSet, 
        readonly target: State<R>
    ) {
    }

    apply(char: number): State<R> | null {
        return this.trigger.contains(char) ? this.target : null
    }

    identicalTo(that: Transition<R>): boolean {
        return this.target === that.target && identical(this.trigger, that.trigger) 
    }

}

class ClosureState<R> extends State<R> {

    protected constructor(readonly automaton: Automaton<R>, readonly stateIndexes: number[]) {
        super(utils.unique(utils.flatMap(stateIndexes, index => automaton.states[index].recognizables)))
    }

    static startStateOf<R>(automaton: Automaton<R>) {
        return ClosureState.enclose(automaton, [0], [])
    }

    private static enclose<R>(automaton: Automaton<R>, stateIndexes: number[], closures: ClosureState<R>[]) {
        const closure = new ClosureState(automaton, utils.unique(stateIndexes).sort());
        const comparator: utils.Comparator<ClosureState<R>> = utils.comparing(state => state.stateIndexes, utils.arrayComparator(utils.numberComparator))
        const identicalClosure = closures.find(c => comparator(c, closure) == 0)
        return identicalClosure || ClosureState.init<R>(closure, automaton, closures) 
    }

    private static init<R>(closure: ClosureState<R>, automaton: Automaton<R>, closures: ClosureState<R>[]) {
        closures.push(closure)
        const states = closure.stateIndexes.map(index => automaton.states[index])
        let transitions = ClosureState.nonOverlappingTransitions<R>(states)
        const groupedTransitions = utils.group(transitions, t => t.trigger, t => t.target, charSetComparator)
        for (let transition of groupedTransitions) {
            const targetIndexes = transition.value.map(target => automaton.states.indexOf(target))
            closure.on(transition.key, ClosureState.enclose(automaton, targetIndexes, closures))
        }
        return closure
    }
    

    private static nonOverlappingTransitions<R>(states: State<R>[]) {
        const transitions = utils.flatMap(states, state => state.transitions)
        const tempState: State<R> = State.create()
        for (let transition of transitions) {
            tempState.on(transition.trigger, transition.target, false)
        }
        tempState.reorganizeTriggerOverlaps()
        return tempState.transitions
    }

}

const rangeComparator: utils.Comparator<charsets.Range> = utils.comparingBy(
    utils.comparing(r => r.min, utils.numberComparator),
    utils.comparing(r => r.max, utils.numberComparator),
)

const charSetComparator: utils.Comparator<charsets.CharSet> = utils.comparing(set => set.ranges, utils.arrayComparator(rangeComparator))

function identical(set1: charsets.CharSet, set2: charsets.CharSet): boolean {
    return charSetComparator(set1, set2) == 0
}
