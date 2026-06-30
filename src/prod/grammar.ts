import { StreamPosition } from "./streams.js";
import * as tokens from "./tokens.js";
import * as utils from "./utils.js";

export class Grammar<T> {

    private optionality: Map<Symbol<any>, boolean> = this.apply(new OptionalityChecker(), null)
    private firstSets: Map<Symbol<any>, TokenTypeSet> = this.apply(new FirstSetDeriver(this.optionality), null)
    private followSets: Map<Symbol<any>, TokenTypeSet> = this.apply(new FollowSetDeriver(this.optionality, this.firstSets), new Set([tokens.eof]))

    readonly symbols: Set<Symbol<any>> = new Set(this.optionality.keys())
    
    constructor(readonly start: Symbol<T>) {
    }

    random(): T {
        return this.start.random()
    }

    private apply<I, O>(evaluator: Evaluator<I, O>, input: I): Map<Symbol<any>, O> {
        const visitor = new RecursiveVisitor(evaluator)
        return visitor.visit(this.start, input)
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

class RecursiveVisitor<I, O> implements Visitor<O> {

    private visited: Set<Symbol<any>> = new Set()
    private cache: Map<Symbol<any>, O> = new Map()
    private cacheChanged: boolean = true

    private stack: I[] = []

    constructor(private evaluator: Evaluator<I, O>) {}
    
    private get input(): I {
        return this.stack[this.stack.length - 1]
    }

    private get subEvaluator(): SubEvaluator<I, O> {
        return this.evaluate.bind(this)
    }

    private evaluate<S>(symbol: Symbol<S>, input: I): O {
        const previousOutput = this.cache.get(symbol)
        const newInput = previousOutput !== undefined ? this.evaluator.newInput(input, previousOutput) : input
        return this.enter(newInput, () => symbol.accept(this))
    }

    private enter<T>(input: I, logic: () => T): T {
        this.stack.push(input)
        try {
            return logic()
        } finally {
            this.stack.pop()
        }
    }

    private pass<S extends Symbol<any>>(symbol: S, resultSupplier: (symbol: S) => O): O {
        let isRecursive = false;
        return (
              this.evaluator.recursiveValueSupplier !== undefined && (isRecursive = this.visited.has(symbol)) ? this.cache.get(symbol) ?? this.evaluator.recursiveValueSupplier()
            : this.evaluator.recursiveValueSupplier === undefined ||  isRecursive ? this.doPass<S>(symbol, resultSupplier)
            : this.topLevelPass<S>(symbol, resultSupplier)
        )
    }

    private topLevelPass<S extends Symbol<any>>(symbol: S, resultSupplier: (symbol: S) => O) {
        this.visited.add(symbol)
        try {
            return this.doPass<S>(symbol, resultSupplier)
        } finally {
            this.visited.delete(symbol)
        }
    }

    private doPass<S extends Symbol<any>>(symbol: S, resultSupplier: (symbol: S) => O) {
        const result = resultSupplier(symbol);
        if (this.evaluator.recursiveValueSupplier !== undefined) {
            const oldResult = this.cache.get(symbol)
            this.cache.set(symbol, result)
            this.cacheChanged ||= (oldResult === undefined || !this.evaluator.equal(result, oldResult))
        }
        return result;
    }

    apply<T>(symbol: Symbol<T>, input: I): O {
        return this.visit(symbol, input).get(symbol) ?? utils.bug()
    }

    visit<T>(symbol: Symbol<T>, input: I): Map<Symbol<any>, O> {
        return this.enter(input, () => {
            while (this.cacheChanged) {
                this.cacheChanged = false;
                symbol.accept(this)
            }
            return this.cache
        })
    }

    visitOptional<T>(symbol: Optional<T>): O {
        return this.pass(symbol, s => this.evaluator.optional(this.subEvaluator, s, this.input))
    }

    visitTerminal<T>(symbol: Terminal<T>): O {
        return this.pass(symbol, s => this.evaluator.terminal(s, this.input))
    }

    visitChoice<P extends utils.OneOrMore<DiscriminatedRepeatable<any, any>>>(symbol: Choice<P>): O {
        return this.pass(symbol, s => this.evaluator.choice(this.subEvaluator, s, this.input))
    }

    visitProduction<D extends Definition>(symbol: Production<D>): O {
        return this.pass(symbol, s => this.evaluator.production(this.subEvaluator, s, this.input))
    }

    visitLazy<S>(symbol: Lazy<S>): O {
        return this.pass(symbol, s => this.doVisitLazy(s))
    }

    visitMappedNonRepeatable<S, T>(symbol: MappedNonRepeatable<S, T>): O {
        return this.pass(symbol, s => this.doVisitMappedNonRepeatable(s))
    }

    visitMappedRepeatable<S, T>(symbol: MappedRepeatable<S, T>): O {
        return this.pass(symbol, s => this.doVisitMappedRepeatable(s))
    }

    doVisitLazy<S>(symbol: Lazy<S>): O {
        return symbol.symbol.accept(this)
    }

    doVisitMappedNonRepeatable<S, T>(symbol: MappedNonRepeatable<S, T>): O {
        return symbol.symbol.accept(this)
    }

    doVisitMappedRepeatable<S, T>(symbol: MappedRepeatable<S, T>): O {
        return symbol.symbol.accept(this)
    }

}

interface Evaluator<I, O> {

    get recursiveValueSupplier(): (() => O) | undefined
    equal(output: O, previousOutput: O): boolean
    newInput(input: I, previousOutput: O): I

    optional<T>(evaluator: SubEvaluator<I, O>, symbol: Optional<T>, input: I): O
    terminal<T>(symbol: Terminal<T>, input: I): O
    choice<P extends utils.OneOrMore<DiscriminatedRepeatable<any, any>>>(evaluator: SubEvaluator<I, O>, symbol: Choice<P>, input: I): O
    production<D extends Definition>(evaluator: SubEvaluator<I, O>, symbol: Production<D>, input: I): O

}

type SubEvaluator<I, O> = <S>(symbol: Symbol<S>, input: I) => O

class OptionalityChecker implements Evaluator<null, boolean> {

    get recursiveValueSupplier(): (() => boolean) | undefined {
        return () => false;
    }

    equal(output: boolean, previousOutput: boolean): boolean {
        return output === previousOutput
    }

    newInput(): null {
        return null
    }

    optional<T>(evaluator: SubEvaluator<null, boolean>, symbol: Optional<T>): boolean {
        evaluator(symbol.symbol, null)
        return true
    }

    terminal<T>(): boolean {
        return false
    }

    choice<P extends utils.OneOrMore<DiscriminatedRepeatable<any, any>>>(evaluator: SubEvaluator<null, boolean>, symbol: Choice<P>): boolean {
        return symbol.productions.reduce((a, p) => evaluator(p, null) || a, false)
    }

    production<D extends Definition>(evaluator: SubEvaluator<null, boolean>, symbol: Production<D>): boolean {
        return symbol.order.reduce((a, k) => evaluator(symbol.definition[k], null) && a, true)
    }

}

class FirstSetDeriver implements Evaluator<null, TokenTypeSet> {

    constructor(private optionality: Map<Symbol<any>, boolean>) {
    }

    get recursiveValueSupplier(): (() => TokenTypeSet) | undefined {
        return () => new Set()
    }

    equal(output: TokenTypeSet, previousOutput: TokenTypeSet): boolean {
        return output.size === previousOutput.size;
    }

    newInput(): null {
        return null
    }

    optional<T>(evaluator: SubEvaluator<null, TokenTypeSet>, symbol: Optional<T>): TokenTypeSet {
        return evaluator(symbol.symbol, null)
    }

    terminal<T>(symbol: Terminal<T>): TokenTypeSet {
        return new Set([symbol.tokenType])
    }

    choice<P extends utils.OneOrMore<DiscriminatedRepeatable<any, any>>>(evaluator: SubEvaluator<null, TokenTypeSet>, symbol: Choice<P>): TokenTypeSet {
        return symbol.productions
            .map(p => evaluator(p, null))
            .reduce(merge, new Set<tokens.TokenType<any>>())
    }

    production<D extends Definition>(evaluator: SubEvaluator<null, TokenTypeSet>, symbol: Production<D>): TokenTypeSet {
        const firstNonOptional = symbol.order.findIndex(k => !this.optionality.get(symbol.definition[k]))
        const keys = firstNonOptional > 0 ? symbol.order.slice(0, firstNonOptional + 1) : symbol.order
        return keys
            .map(k => evaluator(symbol.definition[k], null))
            .reduce(merge, new Set<tokens.TokenType<any>>())
    }

}

class FollowSetDeriver implements Evaluator<TokenTypeSet, TokenTypeSet> {

    constructor(private optionality: Map<Symbol<any>, boolean>, private firstSets: Map<Symbol<any>, TokenTypeSet>) {
    }

    get recursiveValueSupplier(): (() => TokenTypeSet) | undefined {
        return () => new Set()
    }

    equal(output: TokenTypeSet, previousOutput: TokenTypeSet): boolean {
        return output.size === previousOutput.size;
    }

    newInput(input: TokenTypeSet, previousOutput: TokenTypeSet): TokenTypeSet {
        return merge(input, previousOutput)
    }

    optional<T>(evaluator: SubEvaluator<TokenTypeSet, TokenTypeSet>, symbol: Optional<T>, input: TokenTypeSet): TokenTypeSet {
        return evaluator(symbol.symbol, input)
    }

    terminal<T>(_symbol: Terminal<T>, input: TokenTypeSet): TokenTypeSet {
        return input
    }

    choice<P extends utils.OneOrMore<DiscriminatedRepeatable<any, any>>>(evaluator: SubEvaluator<TokenTypeSet, TokenTypeSet>, symbol: Choice<P>, input: TokenTypeSet): TokenTypeSet {
        return symbol.productions.map(p => evaluator(p, input))[0]
    }

    production<D extends Definition>(evaluator: SubEvaluator<TokenTypeSet, TokenTypeSet>, symbol: Production<D>, input: TokenTypeSet): TokenTypeSet {
        let followSet = input
        for (let i = symbol.order.length - 1; i >= 0; i--) {
            const s = symbol.definition[symbol.order[i]]
            evaluator(s, followSet)
            const nextFirstSet = this.firstSets.get(s) ?? new Set()
            followSet = this.optionality.get(s) ? merge(followSet, nextFirstSet) : nextFirstSet
        }
        return input
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
