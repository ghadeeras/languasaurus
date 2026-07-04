import { TokenDefinitions } from "./scanning.js";
import { StreamPosition } from "./streams.js";
import * as tokens from "./tokens.js";
import * as utils from "./utils.js";

export class Grammar<T> {

    readonly symbols = this.start.accept(new SymbolsCollector(), "")

    private optionality = this.accept(new OptionalityChecker(), (o1, o2) => o1 === o2)
    private firstSets = this.accept(new FirstSetDeriver(this.optionality), equalSets)
    private followSets = this.accept(new FollowSetDeriver(this.optionality, this.firstSets), equalSets, set(tokens.eof))
    
    constructor(readonly start: Symbol<T>) {
    }

    private accept<O>(
        visitor: Visitor<Map<Symbol<any>, O>, O>, 
        equality: (o1: O, o2: O) => boolean, 
        startSymbolInitialResult: O | undefined = undefined,
    ) {
        let result = startSymbolInitialResult !== undefined ? map([this.start, startSymbolInitialResult]) : map<Symbol<any>, O>();
        let changed = true;
        while (changed) {
            const next = new Map<Symbol<any>, O>();
            for (const [s, _] of this.symbols) {
                next.set(s, s.accept(visitor, result));
            }
            changed = false
            for (const [s, _] of this.symbols) {
                const r = result.get(s);
                const n = next.get(s);
                changed ||= (r === undefined || n === undefined || !equality(r, n));
            }
            if (startSymbolInitialResult == undefined) {
                result = next;
            }
        }
        return result;
    }

    random(): T {
        return this.start.random()
    }

    isOptional<S>(symbol: Symbol<S>): boolean {
        return this.get(this.optionality, symbol)
    }

    firstSetOf<S>(symbol: Symbol<S>): TokenTypeSet {
        return this.get(this.firstSets, symbol)
    }

    followSetOf<S>(symbol: Symbol<S>): TokenTypeSet {
        return this.get(this.followSets, symbol)
    }

    ll1EligiblityProblems(): string[] {
        const visitor = new LL1EligibilityVerifier(this.firstSets, this.followSets)
        return [...this.symbols].flatMap(([s, p]) => s.accept(visitor, p))
    }

    private get<S, T>(set: Map<Symbol<any>, T>, symbol: Symbol<S>): T {
        return set.get(symbol) ?? this.notFound(symbol)
    }

    private notFound<S, R>(symbol: Symbol<S>): R {
        throw new Error("Symbol not found: " + symbol)
    }

}

export type InferFrom<S extends Symbol<any>> = S extends Symbol<infer T> ? T : never 
export type InferFromProductions<P extends Symbol<any>[]> = 
      P extends [infer H extends Symbol<any>] ? InferFrom<H>
    : P extends [infer H extends Symbol<any>, ...infer T extends Symbol<any>[]] ? InferFrom<H> | InferFromProductions<T> 
    : never 
export type Structure<D extends Definition> = {
    [k in keyof D]: InferFrom<D[k]>
}
export type DiscriminatedNode<D extends string, T> = {
    type: D,
    value: T
}

export type Definition = Record<string, Symbol<any>>
export type TokenTypeSet = Set<tokens.TokenType<any>>

export type TerminalDefinitions<D extends Record<string, tokens.TokenType<any>>> = {
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

export function choice<P extends [DiscriminatedSymbol<any, any>, ...DiscriminatedSymbol<any, any>[]]>(...productions: P): Choice<P> {
    return new ChoiceImpl(productions)
}
export function choiceOf<K extends string, S extends Repeatable<any>>(key: K, symbol: S): Choice<[DiscriminatedSymbol<K, S>]> {
    return choice(symbol.as(key))
}

export function production<D extends Definition>(definition: D, order: (keyof D)[] = Object.keys(definition)): Production<D> {
    return new ProductionImpl(definition, order)
}

export function productionOf<K extends string, S extends Symbol<any>>(key: K, symbol: S): Production<Record<K, S>> {
    const d: Definition = {}
    d[key] = symbol
    return production(d as Record<K, S>)
}

export function recursively<T = any, R extends Definition = Definition>(definition: (self: Repeatable<T>) => [Repeatable<T>, R]): R {
    const result: R[] = []
    new LazyImpl<T>(self => {
        const [s, r] = definition(self);
        result.push(r)
        return s
    })
    return result[0]
}

export interface Symbol<T> {

    size: number

    accept<I, O>(visitor: Visitor<I, O>, input: I): O

    random(): T

    asyncRandom(evaluator: utils.LazyEvaluator, depth?: number): utils.SimplePromise<T>

    tokens(value: T): Generator<tokens.Token<any>>

}

export interface NonDiscriminatedSymbol<T> extends Symbol<T> {

    as<D extends string>(type: D): DiscriminatedSymbol<D, T>

} 

export interface DiscriminatedSymbol<D extends string, T> extends Symbol<DiscriminatedNode<D, T>> {

    type: D

} 

export interface NonRepeatable<T> extends NonDiscriminatedSymbol<T> {

    mapped<R>(toMapper: (v: T) => R, fromMapper: (v: R) => T): NonRepeatable<R>

}

export interface Repeatable<T> extends NonDiscriminatedSymbol<T> {

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

export interface Choice<P extends utils.OneOrMore<DiscriminatedSymbol<any, any>>> extends Repeatable<InferFromProductions<P>> {

    readonly productions: P

    or<K extends string, S extends Repeatable<any>>(key: K, symbol: S): Choice<[...P, DiscriminatedSymbol<K, S>]>

}

export interface Production<D extends Definition> extends Repeatable<Structure<D>> {

    readonly definition: D
    readonly order: (keyof D)[]
    
    then<K extends string, S extends Symbol<any>>(key: K, symbol: S): Production<Record<K, S> & D>

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

abstract class NonDiscriminatedSymbolImpl<T> extends SymbolImpl<T> implements NonDiscriminatedSymbol<T> {

    as<S extends string>(type: S): DiscriminatedSymbol<S, T> {
        return new DiscriminatedSymbolImpl(type, this)
    }

}

abstract class NonRepeatableImpl<T> extends NonDiscriminatedSymbolImpl<T> implements NonRepeatable<T> {

    mapped<R>(toMapper: (v: T) => R, fromMapper: (v: R) => T): NonRepeatable<R> {
        return new MappedNonRepeatableImpl(this, toMapper, fromMapper)
    }

}

abstract class RepeatableImpl<T> extends NonDiscriminatedSymbolImpl<T> implements Repeatable<T> {

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

class ChoiceImpl<P extends utils.OneOrMore<DiscriminatedSymbol<any, any>>> extends RepeatableImpl<InferFromProductions<P>> implements Choice<P> {

    readonly kind = "choice"
    readonly size: number = this.productions.map(p => p.size).reduce((a, b) => a + b, 0)

    constructor(readonly productions: P) {
        super()
    }

    or<K extends string, S extends Repeatable<any>>(key: K, symbol: S): Choice<[...P, DiscriminatedSymbol<K, S>]> {
        return choice(...this.productions, symbol.as(key));
    }

    accept<I, O>(visitor: Visitor<I, O>, input: I): O {
        return visitor.visitChoice(this, input)
    }

    asyncRandom(evaluator: utils.LazyEvaluator, depth: number = 0): utils.SimplePromise<InferFromProductions<P>> {
        let dice = utils.randomInt(this.size)
        let i = 0
        while (dice > this.productions[i].size) {
            dice -= this.productions[i++].size
        }
        return this.productions[i].asyncRandom(evaluator, depth) as unknown as utils.SimplePromise<InferFromProductions<P>>
    }

    *tokens(value: InferFromProductions<P>): Generator<tokens.Token<any>> {
        for (const p of this.productions) {
            if (p.type === value.type) {
                for (const t of p.tokens(value)) {
                    yield t
                }
            }
        }
    }

}

class ProductionImpl<D extends Definition> extends RepeatableImpl<Structure<D>> implements Production<D> {

    readonly kind = "production"
    readonly size: number = this.order.map(k => this.definition[k].size).reduce((a, b) => a * b, 1)
    
    constructor(readonly definition: D, readonly order: (keyof D)[]) {
        super()
    }
    
    then<K extends string, S extends Symbol<any>>(key: K, symbol: S): Production<Record<K, S> & D> {
        const d: Definition = { ...this.definition }
        d[key] = symbol
        return production(d as Record<K, S> & D)
    }

    accept<I, O>(visitor: Visitor<I, O>, input: I): O {
        return visitor.visitProduction(this, input)
    }

    asyncRandom(evaluator: utils.LazyEvaluator, depth: number = 0): utils.SimplePromise<Structure<D>> {
        let content = evaluator<Partial<Structure<D>>>(() => ({}))
        for (const key of this.order) {
            content = content.then(c => {
                const value = this.definition[key].asyncRandom(evaluator, depth + 1);
                return value.then(v => {
                    c[key] = v
                    return c
                })
            })
        }
        return content as utils.SimplePromise<Structure<D>>
    }

    *tokens(value: Structure<D>): Generator<tokens.Token<any>> {
        for (const k of this.order) {
            if (k in value) {
                for (const t of this.definition[k].tokens(value[k])) {
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

class DiscriminatedSymbolImpl<T extends string, S> extends MappedRepeatableImpl<S, DiscriminatedNode<T, S>> implements DiscriminatedSymbol<T, S> {
    
    
    constructor(readonly type: T, readonly symbol: Symbol<S>) {
        super(symbol, node => ({ type, value: node }), node => node.value)
    }

}

export interface Visitor<I, O> {
    visitTerminal<T>(symbol: Terminal<T>, input: I): O;
    visitOptional<T>(symbol: Optional<T>, input: I): O;
    visitChoice<P extends utils.OneOrMore<DiscriminatedSymbol<any, any>>>(symbol: Choice<P>, input: I): O;
    visitProduction<D extends Definition>(symbol: Production<D>, input: I): O;
    visitLazy<S>(symbol: Lazy<S>, input: I): O;
    visitMappedNonRepeatable<S, T>(symbol: MappedNonRepeatable<S, T>, input: I): O;
    visitMappedRepeatable<S, T>(symbol: MappedRepeatable<S, T>, input: I): O;
}

class SymbolsCollector implements Visitor<string, Map<Symbol<any>, string>> {

    private map = new Map<Symbol<any>, string>()

    visitTerminal<T>(symbol: Terminal<T>, path: string): Map<Symbol<any>, string> {
        return this.map.set(symbol, path)
    }

    visitOptional<T>(symbol: Optional<T>, path: string): Map<Symbol<any>, string> {
        return this.addChilds([["?", symbol.symbol]], symbol, path)
    }

    visitChoice<P extends utils.OneOrMore<DiscriminatedSymbol<any, any>>>(symbol: Choice<P>, path: string): Map<Symbol<any>, string> {
        return this.addChilds(symbol.productions.map(p => [p.type, p]), symbol, path)
    }

    visitProduction<D extends Definition>(symbol: Production<D>, path: string): Map<Symbol<any>, string> {
        return this.addChilds(Object.entries(symbol.definition), symbol, path)
    }

    visitLazy<S>(symbol: Lazy<S>, path: string): Map<Symbol<any>, string> {
        return this.map.has(symbol) ? this.map : this.addChilds([["*", symbol.symbol]], symbol, path)
    }

    visitMappedNonRepeatable<S, T>(symbol: MappedNonRepeatable<S, T>, path: string): Map<Symbol<any>, string> {
        return this.addChilds([["~", symbol.symbol]], symbol, path)
    }

    visitMappedRepeatable<S, T>(symbol: MappedRepeatable<S, T>, path: string): Map<Symbol<any>, string> {
        return this.addChilds([["~", symbol.symbol]], symbol, path)
    }

    private addChilds(keyChildTuples: [string, Symbol<any>][], parent: Symbol<any>, path: string): Map<Symbol<any>, string> {
        const result = this.map.set(parent, path);
        keyChildTuples.forEach(([key, child]) => child.accept(this, path + "/" + key));
        return result
    }

}

class OptionalityChecker implements Visitor<Map<Symbol<any>, boolean>, boolean> {

    visitTerminal(): boolean {
        return false
    }

    visitOptional(): boolean {
        return true
    }

    visitChoice<P extends utils.OneOrMore<DiscriminatedSymbol<any, any>>>(symbol: Choice<P>, input: Map<Symbol<any>, boolean>): boolean {
        return symbol.productions.reduce((a, p) => this.get(p, input) || a, false)
    }

    visitProduction<D extends Definition>(symbol: Production<D>, input: Map<Symbol<any>, boolean>): boolean {
        return symbol.order.reduce((a, k) => this.get(symbol.definition[k], input) && a, true)
    }
    
    visitLazy<S>(symbol: Lazy<S>, input: Map<Symbol<any>, boolean>): boolean {
        return this.get(symbol.symbol, input)
    }

    visitMappedNonRepeatable<S, T>(symbol: MappedNonRepeatable<S, T>, input: Map<Symbol<any>, boolean>): boolean {
        return this.get(symbol.symbol, input)
    }

    visitMappedRepeatable<S, T>(symbol: MappedRepeatable<S, T>, input: Map<Symbol<any>, boolean>): boolean {
        return this.get(symbol.symbol, input)
    }

    private get<T>(symbol: Symbol<T>, input: Map<Symbol<any>, boolean>): boolean {
        return input.get(symbol) ?? true
    }

}

class FirstSetDeriver implements Visitor<Map<Symbol<any>, TokenTypeSet>, TokenTypeSet> {

    constructor(private optionality: Map<Symbol<any>, boolean>) {
    }

    visitTerminal<T>(symbol: Terminal<T>): TokenTypeSet {
        return new Set([symbol.tokenType])
    }

    visitOptional<T>(symbol: Optional<T>, input: Map<Symbol<any>, TokenTypeSet>): TokenTypeSet {
        return this.get(symbol.symbol, input)
    }

    visitChoice<P extends utils.OneOrMore<DiscriminatedSymbol<any, any>>>(symbol: Choice<P>, input: Map<Symbol<any>, TokenTypeSet>): TokenTypeSet {
        return symbol.productions
            .map(p => this.get(p, input))
            .reduce(merge, new Set<tokens.TokenType<any>>())
    }

    visitProduction<D extends Definition>(symbol: Production<D>, input: Map<Symbol<any>, TokenTypeSet>): TokenTypeSet {
        const firstNonOptional = symbol.order.findIndex(k => !this.optionality.get(symbol.definition[k]))
        return symbol.order
            .map((k, i) => [this.get(symbol.definition[k], input), i] as const)
            .filter(([_, i]) => i <= firstNonOptional)
            .reduce((set, [s, _]) => merge(set, s), new Set<tokens.TokenType<any>>())
    }

    visitLazy<S>(symbol: Lazy<S>, input: Map<Symbol<any>, TokenTypeSet>): TokenTypeSet {
        return this.get(symbol.symbol, input)
    }

    visitMappedNonRepeatable<S, T>(symbol: MappedNonRepeatable<S, T>, input: Map<Symbol<any>, TokenTypeSet>): TokenTypeSet {
        return this.get(symbol.symbol, input)
    }

    visitMappedRepeatable<S, T>(symbol: MappedRepeatable<S, T>, input: Map<Symbol<any>, TokenTypeSet>): TokenTypeSet {
        return this.get(symbol.symbol, input)
    }

    private get<T>(symbol: Symbol<T>, input: Map<Symbol<any>, TokenTypeSet>): TokenTypeSet {
        return input.get(symbol) ?? new Set()
    }

}

class FollowSetDeriver implements Visitor<Map<Symbol<any>, TokenTypeSet>, TokenTypeSet> {

    constructor(private optionality: Map<Symbol<any>, boolean>, private firstSets: Map<Symbol<any>, TokenTypeSet>) {
    }

    visitTerminal<T>(symbol: Terminal<T>, input: Map<Symbol<any>, TokenTypeSet>): TokenTypeSet {
        return this.get(symbol, input)
    }

    visitOptional<T>(symbol: Optional<T>, input: Map<Symbol<any>, TokenTypeSet>): TokenTypeSet {
        return this.pass(this.get(symbol, input), symbol.symbol, input);
    }

    visitChoice<P extends utils.OneOrMore<DiscriminatedSymbol<any, any>>>(symbol: Choice<P>, input: Map<Symbol<any>, TokenTypeSet>): TokenTypeSet {
        return symbol.productions.reduce((r, p) => this.pass(r, p, input), this.get(symbol, input))
    }

    visitProduction<D extends Definition>(symbol: Production<D>, input: Map<Symbol<any>, TokenTypeSet>): TokenTypeSet {
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

    visitLazy<S>(symbol: Lazy<S>, input: Map<Symbol<any>, TokenTypeSet>): TokenTypeSet {
        return this.pass(this.get(symbol, input), symbol.symbol, input);
    }

    visitMappedNonRepeatable<S, T>(symbol: MappedNonRepeatable<S, T>, input: Map<Symbol<any>, TokenTypeSet>): TokenTypeSet {
        return this.pass(this.get(symbol, input), symbol.symbol, input);
    }

    visitMappedRepeatable<S, T>(symbol: MappedRepeatable<S, T>, input: Map<Symbol<any>, TokenTypeSet>): TokenTypeSet {
        return this.pass(this.get(symbol, input), symbol.symbol, input);
    }

    private pass(result: TokenTypeSet, child: Symbol<any>, input: Map<Symbol<any>, TokenTypeSet>) {
        input.set(child, merge(result, this.get(child, input)));
        return result
    }

    private get<T>(symbol: Symbol<T>, input: Map<Symbol<any>, TokenTypeSet>): TokenTypeSet {
        return input.get(symbol) ?? new Set()
    }

}

class LL1EligibilityVerifier implements Visitor<string, string[]> {

    constructor(
        private firstSets: Map<Symbol<any>, TokenTypeSet>,
        private followSets: Map<Symbol<any>, TokenTypeSet>,
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

    visitChoice<P extends utils.OneOrMore<DiscriminatedSymbol<any, any>>>(symbol: Choice<P>, path: string): string[] {
        const output = []
        const flatFirstSet = symbol.productions.map(p => this.firstSets.get(p)).flatMap(s => [...this.tokensOf(s)])
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
    return recursively((self: Repeatable<Con<T>>) => {
        const list = self.optional()
        const con = production({ head: symbol, tail: list })
        return [con, { list, con }]
    })
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

function merge<T>(s1: Set<T>, s2: Set<T>): Set<T> {
    return new Set([...s1, ...s2])
}

function equalSets<T>(s1: Set<T>, s2: Set<T>): boolean {
    return s1.size === s2.size && [...s1].every(v => s2.has(v))
}

