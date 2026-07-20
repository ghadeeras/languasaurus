import { TokenDefinitions } from "./scanning.js";
import { StreamPosition } from "./streams.js";
import * as tokens from "./tokens.js";
import * as utils from "./utils.js";

export class Grammar<T> {

    readonly symbols = this.start.accept(new SymbolsCollector(), "")

    private optionality = this.runIteratively(new OptionalityDeriver(), (o1, o2) => o1 === o2)
    private firstSets = this.runIteratively(new FirstSetDeriver(this.optionality), equalSets)
    private followSets = this.runIteratively(new FollowSetDeriver(this.optionality, this.firstSets), equalSets, set(tokens.eof), true)
    
    constructor(readonly start: Symbol<T>) {
    }

    /*
     * Deriving the optionality, first tokens, and follow tokens of grammar symbols, on a high level, share a common iterative 
     * process that resolves any circular or recursive dependencies between these symbols. It is based on repeating a derivation 
     * a few times, feeding the output of each iteration into the input of the next iteration, until no changes are seen between 
     * the output and input. This method implements that iterative process.
     */
    private runIteratively<O>(
        visitor: Visitor<Map<Symbol, O>, O>, 
        equality: (o1: O, o2: O) => boolean, 
        startSymbolInitialResult: O | undefined = undefined,
        mutatesInputAndReturnsPrevInput: boolean = false
    ) {
        let result: Map<Symbol, O> = startSymbolInitialResult !== undefined 
            ? map([this.start, startSymbolInitialResult]) 
            : map();
        let changed = true;
        while (changed) {
            const nextResult = this.derive<O>(visitor, result);
            changed = this.compare<O>(result, nextResult, equality);
            if (!mutatesInputAndReturnsPrevInput) {
                result = nextResult;
            }
        }
        return result;
    }

    private derive<O>(visitor: Visitor<Map<Symbol, O>, O>, result: Map<Symbol, O>): Map<Symbol, O> {
        const nextResult = new Map<Symbol, O>();
        for (const [s, _] of this.symbols) {
            nextResult.set(s, s.accept(visitor, result));
        }
        return nextResult;
    }

    private compare<O>(result: Map<Symbol, O>, nextResult: Map<Symbol, O>, equality: (o1: O, o2: O) => boolean) {
        let changed = false;
        for (const [s, _] of this.symbols) {
            const r = result.get(s);
            const n = nextResult.get(s);
            changed ||= (r === undefined || n === undefined || !equality(r, n));
        }
        return changed;
    }

    random(): T {
        return this.start.random()
    }

    isOptional<S>(symbol: Symbol<S>): boolean {
        return get(this.optionality, symbol)
    }

    firstSetOf<S>(symbol: Symbol<S>): TokenTypeSet {
        return get(this.firstSets, symbol)
    }

    followSetOf<S>(symbol: Symbol<S>): TokenTypeSet {
        return get(this.followSets, symbol)
    }

    ll1EligiblityProblems(): string[] {
        const visitor = new LL1EligibilityVerifier(this.firstSets, this.followSets)
        return [...this.symbols].flatMap(([s, p]) => s.accept(visitor, p))
    }

}

export type InferFrom<S extends Symbol> = S extends Symbol<infer T> ? T : never 
export type Cases<D extends Definition> = {
    [k in keyof D]: k extends string ? Case<k, InferFrom<D[k]>> : never
}[keyof D]
export type Structure<D extends Definition> = {
    [k in keyof D]: InferFrom<D[k]>
}
export type Case<D extends string, T> = {
    type: D,
    value: T
}
export type Definition = Record<string, Symbol>
export type TokenTypeSet = Set<tokens.TokenType<any>>
export type TerminalDefinitions<D extends TokenDefinitions> = {
    [k in keyof D]: D[k] extends tokens.TokenType<infer T> ? Terminal<T> : never
};

export function terminals<D extends TokenDefinitions>(definitions: D): TerminalDefinitions<D> {
    const result: Partial<TerminalDefinitions<any>> = {}
    for (const key in definitions) {
        result[key] = terminal(definitions[key])
    }
    return result as TerminalDefinitions<D>
}

export function terminal<T>(tokenType: tokens.TokenType<T>): Terminal<T> {
    return new TerminalImpl(tokenType)
}

export function choice<D extends Definition>(productions: D | (() => D)): Repeatable<Cases<D>> {
    return typeof productions === "function" 
        ? new LazyImpl(() => new ChoiceImpl(productions)) 
        : new ChoiceImpl(() => productions)
}

export function production<D extends Definition>(definition: D | (() => D), order: (keyof D)[] | undefined = undefined): Repeatable<Structure<D>> {
    return typeof definition === "function" 
        ? new LazyImpl(() => new ProductionImpl(definition, order)) 
        : new ProductionImpl(() => definition, order)
}

export interface Symbol<T = any> {

    size: number

    accept<I, O>(visitor: Visitor<I, O>, input: I): O

    random(): T

    asyncRandom(evaluator: utils.LazyEvaluator, depth?: number): utils.SimplePromise<T>

    tokens(value: T): Generator<tokens.Token<any>>

}

export interface NonRepeatable<T = any> extends Symbol<T> {

    mapped<R>(toMapper: (v: T) => R, fromMapper: (v: R) => T): NonRepeatable<R>

}

export interface Repeatable<T = any> extends Symbol<T> {

    optional(): Optional<T>
    zeroOrMore(): NonRepeatable<T[]>
    oneOrMore(): NonRepeatable<[T, ...T[]]>

    mapped<R>(toMapper: (v: T) => R, fromMapper: (v: R) => T): Repeatable<R>

}

export interface Optional<T> extends NonRepeatable<T | null> {

    readonly symbol: Repeatable<T>

}

export interface Terminal<T> extends Repeatable<tokens.Token<T>> {

    readonly tokenType: tokens.TokenType<T>

    tokenless(): Repeatable<T>

}

export interface Choice<P extends Definition> extends Repeatable<Cases<P>> {

    readonly productions: P

}

export interface Production<D extends Definition> extends Repeatable<Structure<D>> {

    readonly definition: D
    readonly order: (keyof D)[]
    
}

export interface Lazy<T> extends Repeatable<T> {

    readonly symbol: Symbol<T>

}

export interface MappedSymbol<S, T> extends Symbol<T> {

    readonly symbol: Symbol<S>
    readonly toMapper: (v: S) => T
    readonly fromMapper: (v: T) => S

}
export interface MappedNonRepeatable<S, T> extends MappedSymbol<S, T>, NonRepeatable<T> {}
export interface MappedRepeatable<S, T> extends MappedSymbol<S, T>, Repeatable<T> {}

abstract class SymbolImpl<T> implements Symbol<T> {

    abstract size: number;

    abstract accept<I, O>(visitor: Visitor<I, O>, input: I): O

    abstract asyncRandom(evaluator: utils.LazyEvaluator, depth?: number): utils.SimplePromise<T>;

    abstract tokens(value: T): Generator<tokens.Token<any>>

    random(): T {
        return utils.evaluate(evaluator => this.asyncRandom(evaluator, 0))
    }
    
}

abstract class NonRepeatableImpl<T> extends SymbolImpl<T> implements NonRepeatable<T> {

    mapped<R>(toMapper: (v: T) => R, fromMapper: (v: R) => T): NonRepeatable<R> {
        return new MappedNonRepeatableImpl(this, toMapper, fromMapper)
    }

}

abstract class RepeatableImpl<T> extends SymbolImpl<T> implements Repeatable<T> {

    optional(): Optional<T> {
        return new OptionalImpl(this)
    }

    zeroOrMore(): NonRepeatable<T[]> {
        return zeroOrMore(this)
    }

    oneOrMore(): NonRepeatable<[T, ...T[]]> {
        return oneOrMore(this)
    }

    mapped<R>(toMapper: (v: T) => R, fromMapper: (v: R) => T): Repeatable<R> {
        return new MappedRepeatableImpl(this, toMapper, fromMapper)
    }

}

class OptionalImpl<T> extends NonRepeatableImpl<T | null> implements Optional<T> {

    readonly size: number = this.symbol.size + 1
    
    constructor(readonly symbol: Repeatable<T>) {
        super()
    }
    
    accept<I, O>(visitor: Visitor<I, O>, input: I): O {
        return visitor.visitOptional(this, input)
    }

    asyncRandom(evaluator: utils.LazyEvaluator, depth: number = 0): utils.SimplePromise<T | null> {
        const dice = Math.random() * this.size * (2 ** (-depth / 256));
        return (dice > 1
            ? this.symbol.asyncRandom(evaluator, depth)
            : evaluator(() => null)
        ) as utils.SimplePromise<T | null>
    }

    *tokens(value: T | null): Generator<tokens.Token<any>> {
        if (value !== null) {
            for (const t of this.symbol.tokens(value)) {
                yield t
            }
        };
    }

}

class TerminalImpl<T> extends RepeatableImpl<tokens.Token<T>> implements Terminal<T> {

    readonly size: number = 1
    
    constructor(readonly tokenType: tokens.TokenType<T>) {
        super()
    }

    accept<I, O>(visitor: Visitor<I, O>, input: I): O {
        return visitor.visitTerminal(this, input)
    }
    
    asyncRandom(evaluator: utils.LazyEvaluator): utils.SimplePromise<tokens.Token<T>> {
        return evaluator(() => this.token(this.tokenType.pattern.randomString(0.125)))
    }

    *tokens(value: tokens.Token<T>): Generator<tokens.Token<any>> {
        yield value
    }

    tokenless(): Repeatable<T> {
        return this.mapped(
            t => t.value,
            v => this.token(this.tokenType.stringify(v))
        )
    }

    private token(lexme: string, position: StreamPosition = { line: 0, column: 0, index: 0 }): tokens.Token<T> {
        return this.tokenType.token(lexme, position);
    }

}

class ChoiceImpl<P extends Definition> extends RepeatableImpl<Cases<P>> implements Choice<P> {

    private _productions = new utils.LazyExpression(this.productionsSupplier)

    constructor(private productionsSupplier: () => P) {
        super()
    }

    get productions() {
        return this._productions.value
    }

    get size() {
        return Object.values(this.productions).map(p => p.size).reduce((a, b) => a + b, 0)
    }

    accept<I, O>(visitor: Visitor<I, O>, input: I): O {
        return visitor.visitChoice(this, input)
    }

    asyncRandom(evaluator: utils.LazyEvaluator, depth: number = 0): utils.SimplePromise<Cases<P>> {
        let dice = utils.randomInt(this.size)
        let i = 0
        const productions = Object.entries(this.productions);
        while (dice >= productions[i][1].size) {
            dice -= productions[i++][1].size
        }
        return productions[i][1].asyncRandom(evaluator, depth)
            .then(value => ({ type: productions[i][0], value }) as Cases<P>)
    }

    *tokens(value: Cases<P>): Generator<tokens.Token<any>> {
        for (const [type, production] of Object.entries(this.productions)) {
            if (type === value.type) {
                for (const token of production.tokens(value.value)) {
                    yield token
                }
            }
        }
    }

}

class ProductionImpl<D extends Definition> extends RepeatableImpl<Structure<D>> implements Production<D> {

    private _definition = new utils.LazyExpression(this.definitionSupplier)
    private _order = new utils.LazyExpression(() => this.customOrder !== undefined ? this.customOrder : Object.keys(this.definition) as (keyof D)[])
    
    constructor(private definitionSupplier: () => D, private customOrder: (keyof D)[] | undefined = undefined) {
        super()
    }

    get definition() {
        return this._definition.value
    }

    get order() {
        return this._order.value
    }
    
    get size() {
        return this.order.map(k => this.definition[k].size).reduce((a, b) => a * b, 1)
    }

    accept<I, O>(visitor: Visitor<I, O>, input: I): O {
        return visitor.visitProduction(this, input)
    }

    asyncRandom(evaluator: utils.LazyEvaluator, depth: number = 0): utils.SimplePromise<Structure<D>> {
        let resultPromise = evaluator<Partial<Structure<D>>>(() => ({}))
        for (const key of this.order) {
            resultPromise = resultPromise.then(result => this.definition[key]
                .asyncRandom(evaluator, depth + 1)
                .then(setInto(result, key))
            )
        }
        return resultPromise as utils.SimplePromise<Structure<D>>
    }

    *tokens(value: Structure<D>): Generator<tokens.Token<any>> {
        for (const key of this.order) {
            if (key in value) {
                for (const t of this.definition[key].tokens(value[key])) {
                    yield t;
                }
            }
        };
    }

}

class LazyImpl<T> extends RepeatableImpl<T> implements Lazy<T> {

    readonly symbol: Repeatable<T>
    readonly size: number = 1

    constructor(symbolSupplier: (self: Repeatable<T>) => Repeatable<T>) {
        super()
        this.symbol = symbolSupplier(this)
    }

    accept<I, O>(visitor: Visitor<I, O>, input: I): O {
        return visitor.visitLazy(this, input)
    }

    asyncRandom(evaluator: utils.LazyEvaluator, depth: number = 0): utils.SimplePromise<T> {
        return this.symbol.asyncRandom(evaluator, depth)
    }
    
    tokens(value: T): Generator<tokens.Token<any>> {
        return this.symbol.tokens(value)
    }

}

class MappedNonRepeatableImpl<S, T> extends NonRepeatableImpl<T> implements MappedNonRepeatable<S, T> {

    readonly size: number = this.symbol.size
    
    constructor(readonly symbol: Symbol<S>, readonly toMapper: (v: S) => T, readonly fromMapper: (v: T) => S) {
        super()
    }

    accept<I, O>(visitor: Visitor<I, O>, input: I): O {
        return visitor.visitMappedNonRepeatable(this, input)
    }

    asyncRandom(evaluator: utils.LazyEvaluator, depth: number = 0): utils.SimplePromise<T> {
        return this.symbol.asyncRandom(evaluator, depth).then(this.toMapper)
    }

    tokens(value: T): Generator<tokens.Token<any>> {
        return this.symbol.tokens(this.fromMapper(value))
    }

}

class MappedRepeatableImpl<S, T> extends RepeatableImpl<T> implements MappedRepeatable<S, T> {

    readonly size: number = this.symbol.size
    
    constructor(readonly symbol: Symbol<S>, readonly toMapper: (v: S) => T, readonly fromMapper: (v: T) => S) {
        super()
    }

    accept<I, O>(visitor: Visitor<I, O>, input: I): O {
        return visitor.visitMappedRepeatable(this, input)
    }

    asyncRandom(evaluator: utils.LazyEvaluator, depth: number): utils.SimplePromise<T> {
        return this.symbol.asyncRandom(evaluator, depth).then(this.toMapper)
    }

    tokens(value: T): Generator<tokens.Token<any>> {
        return this.symbol.tokens(this.fromMapper(value))
    }

}

export interface Visitor<I, O> {
    visitTerminal<T>(symbol: Terminal<T>, input: I): O;
    visitOptional<T>(symbol: Optional<T>, input: I): O;
    visitChoice<P extends Definition>(symbol: Choice<P>, input: I): O;
    visitProduction<D extends Definition>(symbol: Production<D>, input: I): O;
    visitLazy<S>(symbol: Lazy<S>, input: I): O;
    visitMappedNonRepeatable<S, T>(symbol: MappedNonRepeatable<S, T>, input: I): O;
    visitMappedRepeatable<S, T>(symbol: MappedRepeatable<S, T>, input: I): O;
}

class SymbolsCollector implements Visitor<string, Map<Symbol, string>> {

    private map = new Map<Symbol, string>()

    visitTerminal<T>(symbol: Terminal<T>, path: string): Map<Symbol, string> {
        return this.map.set(symbol, path)
    }

    visitOptional<T>(symbol: Optional<T>, path: string): Map<Symbol, string> {
        return this.addChilds([["?", symbol.symbol]], symbol, path)
    }

    visitChoice<P extends Definition>(symbol: Choice<P>, path: string): Map<Symbol, string> {
        return this.addChilds(Object.entries(symbol.productions), symbol, path)
    }

    visitProduction<D extends Definition>(symbol: Production<D>, path: string): Map<Symbol, string> {
        return this.addChilds(Object.entries(symbol.definition), symbol, path)
    }

    visitLazy<S>(symbol: Lazy<S>, path: string): Map<Symbol, string> {
        return this.map.has(symbol) ? this.map : this.addChilds([["*", symbol.symbol]], symbol, path)
    }

    visitMappedNonRepeatable<S, T>(symbol: MappedNonRepeatable<S, T>, path: string): Map<Symbol, string> {
        return this.addChilds([["~", symbol.symbol]], symbol, path)
    }

    visitMappedRepeatable<S, T>(symbol: MappedRepeatable<S, T>, path: string): Map<Symbol, string> {
        return this.addChilds([["~", symbol.symbol]], symbol, path)
    }

    private addChilds(keyChildTuples: [string, Symbol][], parent: Symbol, path: string): Map<Symbol, string> {
        const result = this.map.set(parent, path);
        keyChildTuples.forEach(([key, child]) => child.accept(this, path + "/" + key));
        return result
    }

}

class OptionalityDeriver implements Visitor<Map<Symbol, boolean>, boolean> {

    visitTerminal(): boolean {
        return false
    }

    visitOptional(): boolean {
        return true
    }

    visitChoice<P extends Definition>(symbol: Choice<P>, input: Map<Symbol, boolean>): boolean {
        return Object.values(symbol.productions).reduce((a, p) => this.get(p, input) || a, false)
    }

    visitProduction<D extends Definition>(symbol: Production<D>, input: Map<Symbol, boolean>): boolean {
        return symbol.order.reduce((a, k) => this.get(symbol.definition[k], input) && a, true)
    }
    
    visitLazy<S>(symbol: Lazy<S>, input: Map<Symbol, boolean>): boolean {
        return this.get(symbol.symbol, input)
    }

    visitMappedNonRepeatable<S, T>(symbol: MappedNonRepeatable<S, T>, input: Map<Symbol, boolean>): boolean {
        return this.get(symbol.symbol, input)
    }

    visitMappedRepeatable<S, T>(symbol: MappedRepeatable<S, T>, input: Map<Symbol, boolean>): boolean {
        return this.get(symbol.symbol, input)
    }

    private get<T>(symbol: Symbol<T>, input: Map<Symbol, boolean>): boolean {
        return input.get(symbol) ?? true
    }

}

class FirstSetDeriver implements Visitor<Map<Symbol, TokenTypeSet>, TokenTypeSet> {

    constructor(private optionality: Map<Symbol, boolean>) {
    }

    visitTerminal<T>(symbol: Terminal<T>): TokenTypeSet {
        return new Set([symbol.tokenType])
    }

    visitOptional<T>(symbol: Optional<T>, input: Map<Symbol, TokenTypeSet>): TokenTypeSet {
        return this.get(symbol.symbol, input)
    }

    visitChoice<P extends Definition>(symbol: Choice<P>, input: Map<Symbol, TokenTypeSet>): TokenTypeSet {
        return Object.values(symbol.productions)
            .map(p => this.get(p, input))
            .reduce(merge, new Set<tokens.TokenType<any>>())
    }

    visitProduction<D extends Definition>(symbol: Production<D>, input: Map<Symbol, TokenTypeSet>): TokenTypeSet {
        const firstNonOptional = symbol.order.findIndex(k => !this.optionality.get(symbol.definition[k]))
        return symbol.order
            .map((k, i) => [this.get(symbol.definition[k], input), i] as const)
            .filter(([_, i]) => i <= firstNonOptional)
            .reduce((set, [s, _]) => merge(set, s), new Set<tokens.TokenType<any>>())
    }

    visitLazy<S>(symbol: Lazy<S>, input: Map<Symbol, TokenTypeSet>): TokenTypeSet {
        return this.get(symbol.symbol, input)
    }

    visitMappedNonRepeatable<S, T>(symbol: MappedNonRepeatable<S, T>, input: Map<Symbol, TokenTypeSet>): TokenTypeSet {
        return this.get(symbol.symbol, input)
    }

    visitMappedRepeatable<S, T>(symbol: MappedRepeatable<S, T>, input: Map<Symbol, TokenTypeSet>): TokenTypeSet {
        return this.get(symbol.symbol, input)
    }

    private get<T>(symbol: Symbol<T>, input: Map<Symbol, TokenTypeSet>): TokenTypeSet {
        return input.get(symbol) ?? new Set()
    }

}

class FollowSetDeriver implements Visitor<Map<Symbol, TokenTypeSet>, TokenTypeSet> {

    constructor(private optionality: Map<Symbol, boolean>, private firstSets: Map<Symbol, TokenTypeSet>) {
    }

    visitTerminal<T>(symbol: Terminal<T>, input: Map<Symbol, TokenTypeSet>): TokenTypeSet {
        return this.get(symbol, input)
    }

    visitOptional<T>(symbol: Optional<T>, input: Map<Symbol, TokenTypeSet>): TokenTypeSet {
        return this.pass(this.get(symbol, input), symbol.symbol, input);
    }

    visitChoice<P extends Definition>(symbol: Choice<P>, input: Map<Symbol, TokenTypeSet>): TokenTypeSet {
        return Object.values(symbol.productions).reduce((r, p) => this.pass(r, p, input), this.get(symbol, input))
    }

    visitProduction<D extends Definition>(symbol: Production<D>, input: Map<Symbol, TokenTypeSet>): TokenTypeSet {
        const result = this.get(symbol, input)
        let followSet = result
        for (let i = symbol.order.length - 1; i >= 0; i--) {
            const key = symbol.order[i];
            const s = symbol.definition[key]
            this.pass(followSet, s, input)
            const nextFirstSet = this.get(s, this.firstSets)
            followSet = this.optionality.get(s) ? merge(followSet, nextFirstSet) : nextFirstSet
        }
        return result
    }

    visitLazy<S>(symbol: Lazy<S>, input: Map<Symbol, TokenTypeSet>): TokenTypeSet {
        return this.pass(this.get(symbol, input), symbol.symbol, input);
    }

    visitMappedNonRepeatable<S, T>(symbol: MappedNonRepeatable<S, T>, input: Map<Symbol, TokenTypeSet>): TokenTypeSet {
        return this.pass(this.get(symbol, input), symbol.symbol, input);
    }

    visitMappedRepeatable<S, T>(symbol: MappedRepeatable<S, T>, input: Map<Symbol, TokenTypeSet>): TokenTypeSet {
        return this.pass(this.get(symbol, input), symbol.symbol, input);
    }

    private pass(result: TokenTypeSet, child: Symbol, input: Map<Symbol, TokenTypeSet>) {
        input.set(child, merge(result, this.get(child, input)));
        return result
    }

    private get<T>(symbol: Symbol<T>, input: Map<Symbol, TokenTypeSet>): TokenTypeSet {
        return input.get(symbol) ?? new Set()
    }

}

class LL1EligibilityVerifier implements Visitor<string, string[]> {

    constructor(
        private firstSets: Map<Symbol, TokenTypeSet>,
        private followSets: Map<Symbol, TokenTypeSet>,
    ) {}

    visitTerminal(): string[] {
        return []
    }

    visitOptional<T>(symbol: Optional<T>, path: string): string[] {
        const output = []
        const firstSet = this.firstSets.get(symbol);
        const followSet = this.followSets.get(symbol);
        for (const token of this.tokensOf(firstSet)) {
            if (this.isIn(followSet, token)) {
                output.push(path + ": first and follow set overlap")
                break
            }
        }
        return output
    }

    visitChoice<P extends Definition>(symbol: Choice<P>, path: string): string[] {
        const output = []
        const flatFirstSet = Object.values(symbol.productions).map(p => this.firstSets.get(p)).flatMap(s => [...this.tokensOf(s)])
        const firstSet = this.firstSets.get(symbol);
        const firstSetSize = firstSet !== undefined ? firstSet.size : 0
        if (flatFirstSet.length > firstSetSize) {
            output.push(path + ": first sets overlap")
        }
        return output
    }

    visitProduction(): string[] {
        return []
    }

    visitLazy(): string[] {
        return []
    }

    visitMappedNonRepeatable(): string[] {
        return []
    }

    visitMappedRepeatable(): string[] {
        return []
    }

    private *tokensOf(set: TokenTypeSet | undefined) {
        if (set === undefined) {
            return
        }
        for (const token of set) {
            yield token
        }
    }

    private isIn(set: TokenTypeSet | undefined, token: tokens.TokenType<any>): boolean {
        return set !== undefined ? set.has(token) : false
    }

}

function zeroOrMore<T>(symbol: Repeatable<T>): NonRepeatable<T[]> {
    return listProductions(symbol).list.mapped<T[]>(n => toList(n), l => toLinkedList(l))
}

function oneOrMore<T>(symbol: Repeatable<T>): NonRepeatable<[T, ...T[]]> {
    return listProductions(symbol).con.mapped<[T, ...T[]]>(n => toNonEmptyList(n), l => toCon(l))
}

type LinkedList<T> = Con<T> | null
type Con<T> = {
    head: T
    tail: LinkedList<T>
}

function listProductions<T>(symbol: Repeatable<T>) {
    const con: Repeatable<Con<T>> = production(() => ({ head: symbol, tail: list }))
    const list = con.optional()
    return { list, con }
}

function toList<T>(n: LinkedList<T>): T[] {
    const result: T[] = []
    while (n !== null) {
        result.push(n.head)
        n = n.tail
    }
    return result
}

function toNonEmptyList<T>(n: Con<T>): [T, ...T[]] {
    return [n.head, ...toList(n.tail)]
}

function toLinkedList<T>(l: T[]): LinkedList<T> {
    let tail: LinkedList<T> = null
    for (const head of [...l].reverse()) {
        tail = { head, tail }
    }
    return tail
}

function toCon<T>(l: T[]): Con<T> {
    return toLinkedList(l) as Con<T>
}

function set<T>(...items: T[]): Set<T> {
    return new Set(items)
}

function map<K, V>(...entries: [K, V][]): Map<K, V> {
    return new Map(entries)
}

function get<S, T>(map: Map<Symbol, T>, symbol: Symbol<S>): T {
    return map.get(symbol) ?? notFound(symbol)
}

function notFound<S, R>(symbol: Symbol<S>): R {
    throw new Error("Symbol not found: " + symbol)
}

function merge<T>(s1: Set<T>, s2: Set<T>): Set<T> {
    return new Set([...s1, ...s2])
}

function equalSets<T>(s1: Set<T>, s2: Set<T>): boolean {
    return s1.size === s2.size && [...s1].every(v => s2.has(v))
}

function setInto<P, K extends keyof P>(parent: P, key: K): (child: P[K]) => P {
    return child => {
        parent[key] = child
        return parent
    }
}