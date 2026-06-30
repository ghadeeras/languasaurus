import { StreamPosition } from "./streams.js";
import * as tokens from "./tokens.js";
import * as utils from "./utils.js";

export class Grammar<T> {

    private optionality: Map<Symbol<any>, boolean> = this.apply(new OptionalityChecker())
    private firstSets: Map<Symbol<any>, TokenTypeSet> = this.apply(new FirstSetDeriver(this.optionality))
    private followSets: Map<Symbol<any>, TokenTypeSet> = this.apply(new FollowSetDeriver(this.optionality, this.firstSets))

    readonly symbols: Set<Symbol<any>> = new Set(this.optionality.keys())
    
    constructor(readonly start: Symbol<T>) {
    }

    random(): T {
        return this.start.random()
    }

    private apply<R>(visitor: RecursiveVisitor<R>): Map<Symbol<any>, R> {
        return visitor.visit(this.start)
    }

    isOptional<S>(symbol: Symbol<S>): boolean {
        return this.optionality.get(symbol) ?? this.notFound(symbol)
    }

    firstSetOf<S>(symbol: Symbol<S>): TokenTypeSet {
        return this.firstSets.get(symbol) ?? this.notFound(symbol)
    }

    followSetOf<S>(symbol: Symbol<S>): TokenTypeSet {
        return this.followSets.get(symbol) ?? this.notFound(symbol)
    }

    private notFound<S, R>(symbol: Symbol<S>): R {
        throw new Error("Symbol not found: " + symbol)
    }

}

export type InferFrom<S extends Symbol<any>> = S extends Symbol<infer T> ? T : never 
export type InferFromProductions<P extends Repeatable<any>[]> = 
      P extends [infer H extends Repeatable<any>] ? InferFrom<H>
    : P extends [infer H extends Repeatable<any>, ...infer T extends Repeatable<any>[]] ? InferFrom<H> | InferFromProductions<T> 
    : never 
export type Structure<D extends Definition> = {
    [k in keyof D]: InferFrom<D[k]>
}
export type DiscriminatedNode<T extends string, S> = {
    type: T,
    value: S
}

export type Definition = Record<string, Symbol<any>>
export type TokenTypeSet = Set<tokens.TokenType<any>>

export function terminal<T>(tokenType: tokens.TokenType<T>): Terminal<T> {
    return new TerminalImpl(tokenType)
}

export function choice<P extends [DiscriminatedRepeatable<any, any>, DiscriminatedRepeatable<any, any>, ...DiscriminatedRepeatable<any, any>[]]>(...productions: P): Choice<P> {
    return new ChoiceImpl(productions)
}

export function production<D extends Definition>(definition: D, order: (keyof D)[] = Object.keys(definition)): Production<D> {
    return new ProductionImpl(definition, order)
}

export function recursively<T, R extends Record<string, Symbol<any>>>(definition: (self: Repeatable<T>) => [Repeatable<T>, R]): R {
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

    accept<R>(visitor: Visitor<R>): R

    random(): T

    asyncRandom(evaluator: utils.LazyEvaluator, depth?: number): utils.SimplePromise<T>

    tokens(value: T): Generator<tokens.Token<any>>

}

export interface NonRepeatable<T> extends Symbol<T> {

    mapped<R>(toMapper: (v: T) => R, fromMapper: (v: R) => T): NonRepeatable<R>

}

export interface Repeatable<T> extends Symbol<T> {

    optional(): Optional<T>
    zeroOrMore(): NonRepeatable<T[]>
    oneOrMore(): NonRepeatable<[T, ...T[]]>

    mapped<R>(toMapper: (v: T) => R, fromMapper: (v: R) => T): Repeatable<R>
    as<S extends string>(type: S): DiscriminatedRepeatable<S, T>

}

export interface DiscriminatedRepeatable<T extends string, S> extends Repeatable<DiscriminatedNode<T, S>> {

    type: T

} 

export interface Optional<T> extends NonRepeatable<T | null> {

    readonly symbol: Repeatable<T>

}

export interface Terminal<T> extends Repeatable<tokens.Token<T>> {

    readonly tokenType: tokens.TokenType<T>

    tokenless(): Repeatable<T>

}

export interface Choice<P extends utils.OneOrMore<DiscriminatedRepeatable<any, any>>> extends Repeatable<InferFromProductions<P>> {

    readonly productions: P

}

export interface Production<D extends Definition> extends Repeatable<Structure<D>> {

    readonly definition: D
    readonly order: (keyof D)[]

}

export interface Lazy<T> extends Repeatable<T> {

    readonly symbol: Symbol<T>

}

export interface MappedNonRepeatable<S, T> extends NonRepeatable<T> {

    readonly symbol: NonRepeatable<S>
    readonly toMapper: (v: S) => T
    readonly fromMapper: (v: T) => S

}

export interface MappedRepeatable<S, T> extends Repeatable<T> {

    readonly symbol: Repeatable<S>
    readonly toMapper: (v: S) => T
    readonly fromMapper: (v: T) => S

}

abstract class SymbolImpl<T> implements Symbol<T> {

    abstract size: number;

    abstract accept<R>(visitor: Visitor<R>): R

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

    as<S extends string>(type: S): DiscriminatedRepeatable<S, T> {
        return new TypedRepeatableImpl(type, this)
    }

}

class OptionalImpl<T> extends NonRepeatableImpl<T | null> implements Optional<T> {

    readonly size: number = this.symbol.size + 1
    
    constructor(readonly symbol: Repeatable<T>) {
        super()
    }
    
    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitOptional(this)
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

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitTerminal(this)
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

class ChoiceImpl<P extends utils.OneOrMore<DiscriminatedRepeatable<any, any>>> extends RepeatableImpl<InferFromProductions<P>> implements Choice<P> {

    readonly kind = "choice"
    readonly size: number = this.productions.map(p => p.size).reduce((a, b) => a + b, 0)

    constructor(readonly productions: P) {
        super()
    }

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitChoice(this)
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

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitProduction(this)
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

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitLazy(this)
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
    
    constructor(readonly symbol: NonRepeatable<S>, readonly toMapper: (v: S) => T, readonly fromMapper: (v: T) => S) {
        super()
    }

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitMappedNonRepeatable(this)
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
    
    constructor(readonly symbol: Repeatable<S>, readonly toMapper: (v: S) => T, readonly fromMapper: (v: T) => S) {
        super()
    }

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitMappedRepeatable(this)
    }

    asyncRandom(evaluator: utils.LazyEvaluator, depth: number): utils.SimplePromise<T> {
        return this.symbol.asyncRandom(evaluator, depth).then(this.toMapper)
    }

    tokens(value: T): Generator<tokens.Token<any>> {
        return this.symbol.tokens(this.fromMapper(value))
    }

}

class TypedRepeatableImpl<T extends string, S> extends MappedRepeatableImpl<S, DiscriminatedNode<T, S>> implements DiscriminatedRepeatable<T, S> {
    
    
    constructor(readonly type: T, readonly symbol: Repeatable<S>) {
        super(symbol, node => ({ type, value: node }), node => node.value)
    }

}

export interface Visitor<R> {
    visitOptional<T>(symbol: Optional<T>): R;
    visitTerminal<T>(symbol: Terminal<T>): R;
    visitChoice<P extends utils.OneOrMore<DiscriminatedRepeatable<any, any>>>(symbol: Choice<P>): R;
    visitProduction<D extends Definition>(symbol: Production<D>): R;
    visitLazy<S>(symbol: Lazy<S>): R;
    visitMappedNonRepeatable<S, T>(symbol: MappedNonRepeatable<S, T>): R;
    visitMappedRepeatable<S, T>(symbol: MappedRepeatable<S, T>): R;
}

abstract class RecursiveVisitor<R> implements Visitor<R> {

    private visited: Set<Symbol<any>> = new Set()
    private cache: Map<Symbol<any>, R> = new Map()
    private cacheChanged: boolean = true
    
    constructor(
        private recursiveValueSupplier: (() => R) | undefined = undefined, 
        private equality: (r1: R, r2: R) => boolean = (r1, r2) => r1 === r2
    ) {}
    
    private pass<S extends Symbol<any>>(symbol: S, resultSupplier: (symbol: S) => R): R {
        const isRecursive = this.visited.has(symbol);
        return (
              this.recursiveValueSupplier !== undefined && isRecursive ? this.cache.get(symbol) ?? this.recursiveValueSupplier()
            : this.recursiveValueSupplier === undefined || isRecursive ? this.doPass<S>(symbol, resultSupplier)
            : this.topLevelPass<S>(symbol, resultSupplier)
        )
    }

    private topLevelPass<S extends Symbol<any>>(symbol: S, resultSupplier: (symbol: S) => R) {
        this.visited.add(symbol)
        try {
            return this.doPass<S>(symbol, resultSupplier)
        } finally {
            this.visited.delete(symbol)
        }
    }

    private doPass<S extends Symbol<any>>(symbol: S, resultSupplier: (symbol: S) => R) {
        const result = resultSupplier(symbol);
        if (this.recursiveValueSupplier !== undefined) {
            const oldResult = this.cache.get(symbol)
            this.cache.set(symbol, result)
            this.cacheChanged ||= (oldResult === undefined || !this.equality(result, oldResult))
        }
        return result;
    }

    visit<T>(symbol: Symbol<T>): Map<Symbol<any>, R> {
        while (this.cacheChanged) {
            this.cacheChanged = false;
            symbol.accept(this)
        }
        return this.cache
    }

    visitOptional<T>(symbol: Optional<T>): R {
        return this.pass(symbol, s => this.doVisitOptional(s, this.cache.get(s)))
    }

    visitTerminal<T>(symbol: Terminal<T>): R {
        return this.pass(symbol, s => this.doVisitTerminal(s, this.cache.get(s)))
    }

    visitChoice<P extends utils.OneOrMore<DiscriminatedRepeatable<any, any>>>(symbol: Choice<P>): R {
        return this.pass(symbol, s => this.doVisitChoice(s, this.cache.get(s)))
    }

    visitProduction<D extends Definition>(symbol: Production<D>): R {
        return this.pass(symbol, s => this.doVisitProduction(s, this.cache.get(s)))
    }

    visitLazy<S>(symbol: Lazy<S>): R {
        return this.pass(symbol, s => this.doVisitLazy(s))
    }

    visitMappedNonRepeatable<S, T>(symbol: MappedNonRepeatable<S, T>): R {
        return this.pass(symbol, s => this.doVisitMappedNonRepeatable(s))
    }

    visitMappedRepeatable<S, T>(symbol: MappedRepeatable<S, T>): R {
        return this.pass(symbol, s => this.doVisitMappedRepeatable(s))
    }

    doVisitLazy<S>(symbol: Lazy<S>): R {
        return symbol.symbol.accept(this)
    }

    doVisitMappedNonRepeatable<S, T>(symbol: MappedNonRepeatable<S, T>): R {
        return symbol.symbol.accept(this)
    }

    doVisitMappedRepeatable<S, T>(symbol: MappedRepeatable<S, T>): R {
        return symbol.symbol.accept(this)
    }

    protected abstract doVisitOptional<T>(symbol: Optional<T>, currentResult: R | undefined): R
    protected abstract doVisitTerminal<T>(symbol: Terminal<T>, currentResult: R | undefined): R
    protected abstract doVisitChoice<P extends utils.OneOrMore<DiscriminatedRepeatable<any, any>>>(symbol: Choice<P>, currentResult: R | undefined): R
    protected abstract doVisitProduction<D extends Definition>(symbol: Production<D>, currentResult: R | undefined): R

} 

class OptionalityChecker extends RecursiveVisitor<boolean> {

    constructor() {
        super(() => false)
    }

    protected doVisitOptional<T>(symbol: Optional<T>): boolean {
        symbol.symbol.accept(this)
        return true
    }

    protected doVisitTerminal<T>(symbol: Terminal<T>): boolean {
        return false
    }

    protected doVisitChoice<P extends utils.OneOrMore<DiscriminatedRepeatable<any, any>>>(symbol: Choice<P>): boolean {
        return symbol.productions.reduce((a, p) => p.accept(this) || a, false)
    }

    protected doVisitProduction<D extends Definition>(symbol: Production<D>): boolean {
        return symbol.order.reduce((a, k) => symbol.definition[k].accept(this) && a, true)
    }
    
}

class FirstSetDeriver extends RecursiveVisitor<TokenTypeSet> {

    constructor(private optionality: Map<Symbol<any>, boolean>) {
        super(() => new Set(), (s1, s2) => s1.size === s2.size);
    }
    
    protected doVisitOptional<T>(symbol: Optional<T>): TokenTypeSet {
        return symbol.symbol.accept(this)
    }

    protected doVisitTerminal<T>(symbol: Terminal<T>): TokenTypeSet {
        return new Set([symbol.tokenType])
    }

    protected doVisitChoice<P extends utils.OneOrMore<DiscriminatedRepeatable<any, any>>>(symbol: Choice<P>): TokenTypeSet {
        return symbol.productions
            .map(p => p.accept(this))
            .reduce(merge, new Set<tokens.TokenType<any>>())
    }

    protected doVisitProduction<D extends Definition>(symbol: Production<D>): TokenTypeSet {
        const firstNonOptional = symbol.order.findIndex(k => !this.optionality.get(symbol.definition[k]))
        const keys = firstNonOptional > 0 ? symbol.order.slice(0, firstNonOptional + 1) : symbol.order
        return keys
            .map(k => symbol.definition[k].accept(this))
            .reduce(merge, new Set<tokens.TokenType<any>>())
    }

}

class FollowSetDeriver extends RecursiveVisitor<TokenTypeSet> {

    private stack: TokenTypeSet[] = [new Set([tokens.eof])]

    constructor(private optionality: Map<Symbol<any>, boolean>, private firstSets: Map<Symbol<any>, TokenTypeSet>) {
        super(() => new Set(), (s1, s2) => s1.size === s2.size);
    }

    private get top(): TokenTypeSet {
        return new Set(this.stack[this.stack.length - 1])
    }

    private topAnd(s: TokenTypeSet | undefined): TokenTypeSet {
        return s !== undefined ? merge(s, this.top) : this.top
    }

    private enter<T>(followSet: TokenTypeSet, logic: () => T): T {
        this.stack.push(new Set(followSet))
        try {
            return logic()
        } finally {
            this.stack.pop()
        }
    }

    protected doVisitOptional<T>(symbol: Optional<T>, _: TokenTypeSet | undefined): TokenTypeSet {
        return symbol.symbol.accept(this)
    }

    protected doVisitTerminal<T>(symbol: Terminal<T>, currentResult: TokenTypeSet | undefined): TokenTypeSet {
        return this.topAnd(currentResult)
    }

    protected doVisitChoice<P extends utils.OneOrMore<DiscriminatedRepeatable<any, any>>>(symbol: Choice<P>, _: TokenTypeSet | undefined): TokenTypeSet {
        return symbol.productions.map(p => p.accept(this))[0]
    }

    protected doVisitProduction<D extends Definition>(symbol: Production<D>, currentResult: TokenTypeSet | undefined): TokenTypeSet {
        let nextFirstSet: TokenTypeSet = new Set()
        let result = this.topAnd(currentResult)
        let followSet = result
        for (let i = symbol.order.length - 1; i >= 0; i--) {
            const s = symbol.definition[symbol.order[i]]
            this.enter(followSet, () => s.accept(this))
            nextFirstSet = this.firstSets.get(s) ?? new Set()
            followSet = this.optionality.get(s) ? merge(followSet, nextFirstSet) : nextFirstSet
        }
        return result
    }

}

function merge<T>(s1: Set<T>, s2: Set<T>): Set<T> {
    return new Set([...s1, ...s2])
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
    for (const head of l) {
        tail = { head, tail }
    }
    return tail
}

function toCon<T>(l: T[]): Con<T> {
    return toLinkedList(l) as Con<T>
}
