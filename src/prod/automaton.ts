import * as charset from './charset'
import * as utils from './utils'

export interface Matcher<R> {

    lastRecognized: R[]

    recognized: R[]

    match(char: number): boolean

    randomMatch(): number | null

}

type StateCloner<R> = utils.Mapper<State<R>, State<R>>

export class Automaton<R> {

    readonly states: State<R>[]
    readonly startState: State<R>
    readonly transientStates: State<R>[]
    readonly finalStates: State<R>[]

    private constructor(states: State<R>[]) {
        this.states = utils.unique(states)
        this.startState = this.states[0]
        this.transientStates = this.states.filter(state => state.isTransient)
        this.finalStates = this.states.filter(state => state.isFinal)
    }

    toString(): string {
        let result = ""
        for (let i = 0; i < this.states.length; i++) {
            const state = this.states[i]
            const finalTag = state.isFinal ? '(final)' : ''
            result += `state #${i} ${finalTag}:\n`
            for (let transition of state.transitions) {
                result += `\t on ${transition.trigger} --> state #${this.states.indexOf(transition.target)} \n`
            }
        }
        return result 
    }

    deterministic(): Automaton<R> {
        const ndf = this.cloneNoDuplicates()
        const df = Automaton.create(ClosureState.startStateOf(ndf))
        return df.cloneNoDuplicates()
    }

    get isOptional(): boolean {
        return this.startState.isFinal
    }

    private reorganizeTriggerOverlaps() {
        this.states.forEach(s => s.reorganizeTriggerOverlaps())
    }

    optional(): Automaton<R> {
        if (this.isOptional) {
            return this
        }
        return this.clone((state, index) => index == 0 ? 
            State.likeUnion(this.finalStates) : 
            State.like(state)
        )
    }

    repetition(): Automaton<R> {
        const draft = this.clone()
        for (let finalState of draft.finalStates) {
            for (let transition of draft.startState.transitions) {
                finalState.on(transition.trigger, transition.target)
            }
        }
        return Automaton.create(draft.startState)
    }

    static choice<R>(automaton: Automaton<R>, ...automata: Automaton<R>[]): Automaton<R> {
        automata.unshift(automaton)
        const startState: State<R> = State.likeUnion(automata.map(a => a.startState))
        const stateCloner: StateCloner<R> = (state, index) => index == 0 ? startState : State.like(state)
        for (let automaton of automata) {
            automaton.clone(stateCloner)
        }
        return Automaton.create(startState)
    }

    static concat<R>(automaton: Automaton<R>, ...automata: Automaton<R>[]): Automaton<R> {
        automata.unshift(automaton)
        const lastNonOptional = automata.reduce((max, automaton, index) => !automaton.isOptional && index > max ? index : max, -1)
        const startState: State<R> = lastNonOptional <= -1 ? State.like(automaton.startState) : State.create()
        let jointStates: State<R>[] = [startState]
        for (let i = 0; i < automata.length; i++) {
            jointStates = Automaton.append(automata[i], jointStates, i >= lastNonOptional)
        }
        return Automaton.create(startState)
    }

    private static append<R>(automaton: Automaton<R>, prevStates: State<R>[], optional: boolean) {
        const nextStates: State<R>[] = automaton.isOptional ? [...prevStates] : []
        const cloner: StateCloner<R> = state => {
            const clone: State<R> = optional ? State.like(state) : State.create()
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

    newMatcher(): Matcher<R> {
        return new AutomatonMathcer(this.startState)
    }

    static create<R>(start: State<R>) {
        return new Automaton(this.allStatesFrom(start))
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
        let oldSize = this.states.length
        this.reorganizeTriggerOverlaps()
        let automaton = this.cloneNoShallowDuplicates()
        let newSize = automaton.states.length
        while (newSize < oldSize) {
            oldSize = newSize
            automaton.reorganizeTriggerOverlaps()
            automaton = automaton.cloneNoShallowDuplicates()
            newSize = automaton.states.length
        }
        return automaton
    }

    private cloneNoShallowDuplicates() {
        const visitedStates: State<R>[] = []
        const clonedStates: State<R>[] = []
        const cloner: StateCloner<R> = state => {
            let index = visitedStates.findIndex(s => s.identicalTo(state))
            if (index < 0) {
                visitedStates.push(state)
                clonedStates.push(State.like(state))
                index = clonedStates.length - 1
             }
             return clonedStates[index]
        }
        return this.clone(cloner)
    }
    

    private clone(stateCloner: StateCloner<R> = s => State.like(s)): Automaton<R> {
        let clones: State<R>[] = this.states.map((state, index) => {
            state.index = index
            return stateCloner(state, index)
        })
        for (let i = 0; i < this.states.length; i++) {
            const state = this.states[i]
            const clone = clones[i]
            for (let transition of state.transitions) {
                const index = transition.target.index
                clone.on(transition.trigger, clones[index])
            }
        }
        return new Automaton(clones)
    }

}

class AutomatonMathcer<R> implements Matcher<R> {

    private _current: State<R>
    private _lastRecognized: R[]
    private _recognized: R[]
    
    constructor(start: State<R>) {
        this._current = start
        this._lastRecognized = this._recognized = start.recognizables
    }

    get lastRecognized() {
        return this._lastRecognized
    }

    get recognized() {
        return this._recognized
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

    readonly transitions: Transition<R>[] = []

    index: number = -1

    protected constructor(readonly recognizables: R[]) {
    }

    reorganizeTriggerOverlaps() {
        const triggers = this.transitions.map(t => t.trigger)
        const targets = this.transitions.map(t => t.target)
        const overlaps = charset.computeOverlaps(...triggers)
        this.transitions.splice(0)
        for (let overlap of overlaps) {
            for (let range of overlap.value.ranges) {
                for (let i of overlap.key) {
                    this.on(charset.range(range.min, range.max), targets[i], false)
                }
            }
        }
    }

    on(trigger: charset.CharSet, target: State<R>, optimized: boolean = true) {
        const index = optimized ? this.transitions.findIndex(t => t.target == target) : -1
        if (index < 0) {
            this.transitions.push(new Transition(trigger, target))
        } else {
            const existingTrigger = this.transitions[index].trigger
            this.transitions[index] = new Transition(charset.union(existingTrigger, trigger), target)
        }
    }

    identicalTo(that: State<R>): boolean {
        const result = this === that || 
            this.recognizables.length == that.recognizables.length && 
            this.recognizables.every(thisR => that.recognizables.findIndex(thatR => thisR === thatR) >= 0) && 
            this.transitions.length == that.transitions.length && 
            this.transitions.every(thisT => that.transitions.findIndex(thatT => thisT.identicalTo(thatT)) >= 0)
        return result
    }

    get isFinal(): boolean {
        return this.recognizables.length > 0
    }

    get isTransient(): boolean {
        return !this.isFinal
    }

    static create<R>(...recognizables: R[]): State<R> {
        return new State(utils.unique<R>(recognizables))
    }

    static like<R>(state: State<R>): State<R> {
        return State.create(...state.recognizables)
    }

    static likeUnion<R>(states: State<R>[]): State<R> {
        return State.create(...utils.flatMap(states, state => state.recognizables))
    }

}

class Transition<R> {

    constructor(
        readonly trigger: charset.CharSet, 
        readonly target: State<R>
    ) {
    }

    apply(char: number): State<R> | null {
        return this.trigger.contains(char) ? this.target : null
    }

    identicalTo(that: Transition<R>): boolean {
        return this.target === that.target && charset.identical(this.trigger, that.trigger) 
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
        const groupedTransitions = utils.group(transitions, t => t.trigger, t => t.target, charset.charSetComparator)
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