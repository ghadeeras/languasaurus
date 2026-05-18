import * as charsets from './charsets.js'
import * as utils from './utils.js'

export interface Matcher<R> {

    readonly lastRecognized: R[]

    readonly recognized: R[]

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
    return automaton.or(...automata)
}

export function concat<R>(automaton: Automaton<R>, ...automata: Automaton<R>[]): Automaton<R> {
    return automaton.then(...automata)
}

export class Automaton<R> {

    private _states: State<R>[]
    private _transientStates: State<R>[]
    private _finalStates: State<R>[]
    private _startState: State<R>

    private constructor(states: State<R>[]) {
        this._states = utils.unique(states)
        this._transientStates = this._states.filter(state => state.isTransient)
        this._finalStates = this._states.filter(state => state.isFinal)
        this._startState = this._states[0]
    }

    get isOptional(): boolean {
        return this.startState.isFinal
    }

    get states() {
        return [...this._states]
    }

    get transientStates() {
        return [...this._transientStates]
    }

    get finalStates() {
        return [...this._finalStates]
    }

    get startState() {
        return this._startState
    }

    newMatcher(): Matcher<R> {
        return new AutomatonMatcher(this.startState)
    }

    toString(): string {
        let result = ""
        for (let i = 0; i < this._states.length; i++) {
            const state = this._states[i]
            const finalTag = state.isFinal ? ' (final)' : ''
            result += `state #${i}${finalTag}:\n`
            for (const transition of state.transitions) {
                result += `\t on ${transition.trigger} --> state #${this._states.indexOf(transition.target)} \n`
            }
        }
        return result 
    }

    clone(): Automaton<R> {
        return this.mapStates(s => Automaton.state(s))
    }

    map<RR>(mapper: utils.Mapper<R, RR>): Automaton<RR> {
        return this.mapStates(state => State.create(...state.recognizables.map(mapper)))
    }

    mapStates<RR>(stateMapper: StateMapper<R, RR>): Automaton<RR> {
        const map = new Map<State<R>, State<RR>>()
        const mappedStates = this._states.map((state, index) => {
            let mappedState = stateMapper(state, index)
            map.set(state, mappedState)
            return mappedState
        })
        for (const [state, mappedState] of map.entries()) {
            for (const transition of state.transitions) {
                const mappedTarget = map.get(transition.target) ?? utils.bug()
                mappedState.on(transition.trigger, mappedTarget)
            }
        }
        return new Automaton(mappedStates)
    }

    optional(): Automaton<R> {
        if (this.isOptional) {
            return this
        }
        const newStartState = Automaton.unionState(this._finalStates)
        const clone = this.clone()
        for (const transition of clone.startState.transitions) {
            newStartState.on(transition.trigger, transition.target)
        }
        return Automaton.create(newStartState)
    }

    repeated(): Automaton<R> {
        const clone = this.clone()
        for (const finalState of clone._finalStates) {
            for (const transition of clone.startState.transitions) {
                finalState.on(transition.trigger, transition.target)
            }
        }
        return Automaton.create(clone.startState)
    }

    or(...automata: Automaton<R>[]): Automaton<R> {
        automata.unshift(this)
        const startState = Automaton.unionState(automata.map(a => a.startState))
        for (const automaton of automata) {
            const clone = automaton.clone()
            for (const transition of clone.startState.transitions) {
                startState.on(transition.trigger, transition.target)
            }
        }
        return Automaton.create(startState)
    }

    then(...automata: Automaton<R>[]): Automaton<R> {
        automata.unshift(this)
        const lastNonOptionalIndex = automata.reduce((max, automaton, index) => !automaton.isOptional && index > max ? index : max, -1)
        const startState = lastNonOptionalIndex <= -1 
            ? Automaton.state(this.startState) // entire concatenation is optional, so we should copy the start recognizing state
            : State.create<R>()
        let jointStates: State<R>[] = [startState]
        for (let i = 0; i < automata.length; i++) {
            jointStates = Automaton.append(automata[i], jointStates, i >= lastNonOptionalIndex)
        }
        return Automaton.create(startState)
    }

    static create<R>(start: State<R>) {
        return new Automaton(this.allStatesFrom(start))
    } 

    private static append<R>(automaton: Automaton<R>, prevStates: State<R>[], recognizesConcatenation: boolean) {
        const nextStates = automaton.isOptional ? [...prevStates] : []
        const clonedAutomaton = automaton.mapStates(state => {
            const clone = recognizesConcatenation 
                ? Automaton.state(state) // if the automaton recognizes the concatenation, we should copy the recognizing states.
                : State.create<R>() // otherwise, recognizing states should be replaced with transient ones.
            if (state.isFinal) {
                nextStates.push(clone)
            }
            return clone
        })
        for (const prevState of prevStates) {
            for (const transition of clonedAutomaton.startState.transitions) {
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

    private static doTraverse<R>(state: State<R>, visitedStates: Set<State<R>>, consumer: utils.Consumer<State<R>>) {
        if (!visitedStates.has(state)) {
            visitedStates.add(state)
            consumer(state)
            for (const transition of state.transitions) {
                Automaton.doTraverse(transition.target, visitedStates, consumer)
            }
        }
    }

    deterministic(): Automaton<R> {
        const converter = new NDFAToDFAConverter(this.minimal())
        return converter.convert().minimal()
    }

    private minimal(): Automaton<R> {
        let automaton: Automaton<R> = this
        let newSize = automaton._states.length
        let oldSize = 0
        do {
            oldSize = newSize
            automaton.reorganizeTriggerOverlaps()
            automaton = automaton.shallowMinimal()
            newSize = automaton._states.length
        } while (newSize < oldSize)
        return automaton
    }

    private reorganizeTriggerOverlaps() {
        this._states.forEach(s => s.reorganizeTriggerOverlaps())
    }

    private shallowMinimal() {
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
        return this.mapStates(cloner)
    }    

    private static state<R>(state: State<R>): State<R> {
        return State.create(...state.recognizables)
    }

    private static unionState<R>(states: State<R>[]): State<R> {
        return State.create(...states.flatMap(state => state.recognizables))
    }

}

type StateMapper<R1, R2> = utils.Mapper<State<R1>, State<R2>>
type StateCloner<R> = StateMapper<R, R>

class AutomatonMatcher<R> implements Matcher<R> {

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
        for (const transition of this._current.transitions) {
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
        for (const overlap of overlaps) {
            for (const range of overlap.value.ranges) {
                for (const i of overlap.key) {
                    this.on(charsets.range(range.min, range.max), targets[i], false)
                }
            }
        }
    }

    onCharFrom(chars: string, target: State<R>): State<R> {
        return this.on(charsets.chars(chars), target)
    }

    onCharIn(range: string, target: State<R>): State<R> {
        return this.on(charsets.range(
            range.charCodeAt(0), 
            range.charCodeAt(range.length - 1)
        ), target)
    }

    onCharNotFrom(chars: string, target: State<R>): State<R> {
        return this.on(charsets.complement(charsets.chars(chars)), target)
    }

    onCharNotIn(range: string, target: State<R>): State<R> {
        return this.on(charsets.complement(charsets.range(
            range.charCodeAt(0), 
            range.charCodeAt(range.length - 1)
        )), target)
    }

    on(trigger: charsets.CharSet, target: State<R>, allowTransitionMerging = true): State<R> {
        const index = allowTransitionMerging ? this._transitions.findIndex(t => t.target == target) : -1
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

class NDFAToDFAConverter<R> {

    private closures: ClosureState<R>[] = []    
    private comparator: utils.Comparator<ClosureState<R>> = utils.comparing(state => state.stateIndexes, utils.arrayComparator(utils.numberComparator))

    constructor(private automaton: Automaton<R>) {
    }

    convert(): Automaton<R> {
        return Automaton.create(this.enclose([0]))
    }

    private enclose(stateIndexes: number[]) {
        const closure = new ClosureState(this.automaton, stateIndexes);
        const identicalClosure = this.closures.find(c => this.comparator(c, closure) == 0)
        return identicalClosure || this.init(closure) 
    }

    private init(closure: ClosureState<R>) {
        this.closures.push(closure)
        const states = closure.stateIndexes.map(index => this.automaton.states[index])
        const transitions = NDFAToDFAConverter.nonOverlappingTransitions<R>(states)
        const groupedTransitions = utils.group(transitions, t => t.trigger, t => t.target, charSetComparator)
        for (const transition of groupedTransitions) {
            const targetIndexes = transition.value.map(target => this.automaton.states.indexOf(target))
            closure.on(transition.key, this.enclose(targetIndexes))
        }
        return closure
    }
    

    private static nonOverlappingTransitions<R>(states: State<R>[]) {
        const transitions = states.flatMap(state => state.transitions)
        const tempState: State<R> = State.create()
        for (const transition of transitions) {
            tempState.on(transition.trigger, transition.target, false)
        }
        tempState.reorganizeTriggerOverlaps()
        return tempState.transitions
    }

}

class ClosureState<R> extends State<R> {

    readonly stateIndexes: number[]

    constructor(readonly automaton: Automaton<R>, stateIndexes: number[]) {
        super(utils.unique(stateIndexes.flatMap(index => automaton.states[index].recognizables)))
        this.stateIndexes = utils.unique(stateIndexes).sort()
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
