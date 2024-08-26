import * as tokens from "./tokens.js";
import * as utils from "./utils.js";

export class Grammar<T> {

    private optionality: Map<Symbol<any>, boolean> = this.apply(new OptionalityChecker())
    private firstSets: Map<Symbol<any>, TokenTypeSet> = this.apply(new FirstSetDeriver(this.optionality))
    private followSets: Map<Symbol<any>, TokenTypeSet> = this.apply(new FollowSetDeriver(this.optionality, this.firstSets))

    readonly symbols: Set<Symbol<any>> = new Set(this.optionality.keys())
    
    constructor(readonly start: Symbol<T>) {
    }

    private apply<R>(visitor: RecursiveVisitor<R>): Map<Symbol<any>, R> {
        this.start.accept(visitor)
        return visitor.cache
    }

    isOptional<T>(symbol: Symbol<T>): boolean {
        return this.optionality.get(symbol) ?? this.notFound(symbol)
    }

    firstSetOf<T>(symbol: Symbol<T>): TokenTypeSet {
        return this.firstSets.get(symbol) ?? this.notFound(symbol)
    }

    followSetOf<T>(symbol: Symbol<T>): TokenTypeSet {
        return this.followSets.get(symbol) ?? this.notFound(symbol)
    }

    private notFound<T, R>(symbol: Symbol<T>): R {
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
export type TypedNode<T extends string, S> = {
    type: T,
    content: S
}

export type Definition = Record<string, Symbol<any>>
export type TokenTypeSet = Set<tokens.TokenType<any>>

export type RecursiveSymbols<K extends string, T> = Record<string, Symbol<any>> & Record<K, Repeatable<T>> 

export function terminal<T>(tokenType: tokens.TokenType<T>): Terminal<T> {
    return new TerminalImpl(tokenType)
}

export function choice<P extends [Repeatable<any>, Repeatable<any>, ...Repeatable<any>[]]>(...productions: P): Choice<P> {
    return new ChoiceImpl(productions)
}

export function production<D extends Definition>(definition: D, order: (keyof D)[] = Object.keys(definition)): Production<D> {
    return new ProductionImpl(definition, order)
}

export function recursively<T, K extends string, R extends RecursiveSymbols<K, T>>(key: K, definition: (self: Repeatable<T>) => R): R {
    const result: R[] = []
    new LazyImpl<T>(self => {
        result.push(definition(self));
        return result[0][key]
    })
    return result[0]
}

export interface Symbol<T> {

    accept<R>(visitor: Visitor<R>): R

    random(evaluator: utils.LazyEvaluator): utils.LazyPromise<T>

}

export interface NonRepeatable<T> extends Symbol<T> {

    mapped<R>(toMapper: (v: T) => R, fromMapper: (v: R) => T): NonRepeatable<R>
    typedAs<S extends string>(type: S): NonRepeatable<TypedNode<S, T>>

}

export interface Repeatable<T> extends Symbol<T> {

    optional(): Optional<T>
    zeroOrMore(): NonRepeatable<T[]>
    oneOrMore(): NonRepeatable<[T, ...T[]]>

    mapped<R>(toMapper: (v: T) => R, fromMapper: (v: R) => T): Repeatable<R>
    typedAs<S extends string>(type: S): Repeatable<TypedNode<S, T>>

}

export interface Optional<T> extends NonRepeatable<T | null> {

    readonly symbol: Repeatable<T>

}

export interface Terminal<T> extends Repeatable<T> {

    readonly tokenType: tokens.TokenType<T>

}

export interface Choice<P extends Repeatable<any>[]> extends Repeatable<InferFromProductions<P>> {

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

    abstract accept<R>(visitor: Visitor<R>): R

    abstract random(evaluator: utils.LazyEvaluator): utils.LazyPromise<T>;
    
}

abstract class NonRepeatableImpl<T> extends SymbolImpl<T> implements NonRepeatable<T> {

    mapped<R>(toMapper: (v: T) => R, fromMapper: (v: R) => T): NonRepeatable<R> {
        return new MappedNonRepeatableImpl(this, toMapper, fromMapper)
    }

    typedAs<S extends string>(type: S): NonRepeatable<TypedNode<S, T>> {
        return this.mapped(node => ({ type, content: node }), node => node.content)
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

    typedAs<S extends string>(type: S): Repeatable<TypedNode<S, T>> {
        return this.mapped(node => ({ type, content: node }), node => node.content)
    }

}

class OptionalImpl<T> extends NonRepeatableImpl<T | null> implements Optional<T> {

    constructor(readonly symbol: Repeatable<T>) {
        super()
    } 

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitOptional(this)
    }

    random(evaluator: utils.LazyEvaluator): utils.LazyPromise<T | null> {
        return (utils.randomInt(evaluator.computationSize) < 256 
            ? this.symbol.random(evaluator).then<T | null>(v => v)
            : evaluator.evaluate<T | null>(() => null)
        )
    }

}

class TerminalImpl<T> extends RepeatableImpl<T> implements Terminal<T> {

    constructor(readonly tokenType: tokens.TokenType<T>) {
        super()
    }

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitTerminal(this)
    }
    
    random(evaluator: utils.LazyEvaluator): utils.LazyPromise<T> {
        return evaluator.evaluate(() => (this.tokenType.parse(this.tokenType.pattern.randomString(0.125))))
    }

}

class ChoiceImpl<P extends Repeatable<any>[]> extends RepeatableImpl<InferFromProductions<P>> implements Choice<P> {

    readonly kind = "choice"
    
    constructor(readonly productions: P) {
        super()
    }

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitChoice(this)
    }

    random(evaluator: utils.LazyEvaluator): utils.LazyPromise<InferFromProductions<P>> {
        const i = utils.randomInt(this.productions.length)
        return this.productions[i].random(evaluator)
    }

}

class ProductionImpl<D extends Definition> extends RepeatableImpl<Structure<D>> implements Production<D> {

    readonly kind = "production"
    
    constructor(readonly definition: D, readonly order: (keyof D)[]) {
        super()
    }

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitProduction(this)
    }

    random(evaluator: utils.LazyEvaluator): utils.LazyPromise<Structure<D>> {
        let content = evaluator.evaluate<Partial<Structure<D>>>(() => ({}))
        for (const key of this.order) {
            content = content.then(c => 
                this.definition[key].random(evaluator).then(v => {
                    c[key] = v
                    return c
                })
            )
        }
        return content as utils.LazyPromise<Structure<D>>
    }

}

class LazyImpl<T> extends RepeatableImpl<T> implements Lazy<T> {

    readonly symbol: Repeatable<T>

    constructor(symbolSupplier: (self: Repeatable<T>) => Repeatable<T>) {
        super()
        this.symbol = symbolSupplier(this)
    }

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitLazy(this)
    }

    random(evaluator: utils.LazyEvaluator): utils.LazyPromise<T> {
        return this.symbol.random(evaluator)
    }
    
}

class MappedNonRepeatableImpl<S, T> extends NonRepeatableImpl<T> implements MappedNonRepeatable<S, T> {

    constructor(readonly symbol: NonRepeatable<S>, readonly toMapper: (v: S) => T, readonly fromMapper: (v: T) => S) {
        super()
    }

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitMappedNonRepeatable(this)
    }

    random(evaluator: utils.LazyEvaluator): utils.LazyPromise<T> {
        return this.symbol.random(evaluator).then(this.toMapper)
    }

}

class MappedRepeatableImpl<S, T> extends RepeatableImpl<T> implements MappedRepeatable<S, T> {

    constructor(readonly symbol: Repeatable<S>, readonly toMapper: (v: S) => T, readonly fromMapper: (v: T) => S) {
        super()
    }

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitMappedRepeatable(this)
    }

    random(evaluator: utils.LazyEvaluator): utils.LazyPromise<T> {
        return this.symbol.random(evaluator).then(this.toMapper)
    }

}

export interface Visitor<R> {
    visitOptional<T>(symbol: Optional<T>): R;
    visitTerminal<T>(symbol: Terminal<T>): R;
    visitChoice<P extends Repeatable<any>[]>(symbol: Choice<P>): R;
    visitProduction<D extends Definition>(symbol: Production<D>): R;
    visitLazy<S>(symbol: Lazy<S>): R;
    visitMappedNonRepeatable<S, T>(symbol: MappedNonRepeatable<S, T>): R;
    visitMappedRepeatable<S, T>(symbol: MappedRepeatable<S, T>): R;
}

abstract class RecursiveVisitor<R> implements Visitor<R> {

    private visited: Set<Symbol<any>> = new Set()
    readonly cache: Map<Symbol<any>, R> = new Map()
    
    constructor(private reprocessCached: boolean, private recursiveValue: () => R) {
    }
    
    private pass<S extends Symbol<any>>(symbol: S, resultSupplier: (symbol: S) => R): R {
        if (this.visited.has(symbol)) {
            return this.recursiveValue()
        }
        this.visited.add(symbol)
        try {
            let result = this.cache.get(symbol)
            if (this.reprocessCached || result == undefined) {
                result = resultSupplier(symbol)
                this.cache.set(symbol, result)
            }
            return result
        } finally {
            this.visited.delete(symbol)
        }
    }

    visitOptional<T>(symbol: Optional<T>): R {
        return this.pass(symbol, s => this.doVisitOptional(s))
    }

    visitTerminal<T>(symbol: Terminal<T>): R {
        return this.pass(symbol, s => this.doVisitTerminal(s))
    }

    visitChoice<P extends Repeatable<any>[]>(symbol: Choice<P>): R {
        return this.pass(symbol, s => this.doVisitChoice(s))
    }

    visitProduction<D extends Definition>(symbol: Production<D>): R {
        return this.pass(symbol, s => this.doVisitProduction(s))
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

    protected abstract doVisitOptional<T>(symbol: Optional<T>): R
    protected abstract doVisitTerminal<T>(symbol: Terminal<T>): R
    protected abstract doVisitChoice<P extends Repeatable<any>[]>(symbol: Choice<P>): R
    protected abstract doVisitProduction<D extends Definition>(symbol: Production<D>): R

} 

class OptionalityChecker extends RecursiveVisitor<boolean> {

    constructor() {
        super(false, () => false)
    }

    protected doVisitOptional<T>(symbol: Optional<T>): boolean {
        symbol.symbol.accept(this)
        return true
    }

    protected doVisitTerminal<T>(symbol: Terminal<T>): boolean {
        return false
    }

    protected doVisitChoice<P extends Repeatable<any>[]>(symbol: Choice<P>): boolean {
        return symbol.productions.reduce((a, p) => p.accept(this) || a, false)
    }

    protected doVisitProduction<D extends Definition>(symbol: Production<D>): boolean {
        return symbol.order.reduce((a, k) => symbol.definition[k].accept(this) && a, true)
    }
    
}

class FirstSetDeriver extends RecursiveVisitor<TokenTypeSet> {

    constructor(private optionality: Map<Symbol<any>, boolean>) {
        super(false, () => new Set());
    }
    
    protected doVisitOptional<T>(symbol: Optional<T>): TokenTypeSet {
        return symbol.symbol.accept(this)
    }

    protected doVisitTerminal<T>(symbol: Terminal<T>): TokenTypeSet {
        return new Set([symbol.tokenType])
    }

    protected doVisitChoice<P extends Repeatable<any>[]>(symbol: Choice<P>): TokenTypeSet {
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

    private stack: TokenTypeSet[] = [new Set()]

    constructor(private optionality: Map<Symbol<any>, boolean>, private firstSets: Map<Symbol<any>, TokenTypeSet>) {
        super(true, () => new Set());
    }

    private cached<S extends Symbol<any>>(symbol: S): TokenTypeSet {
        let result = this.cache.get(symbol)
        return result ?? new Set()
    }
    
    private get top(): TokenTypeSet {
        return new Set(this.stack[this.stack.length - 1])
    }

    private enter<T>(followSet: TokenTypeSet, logic: () => T): T {
        this.stack.push(new Set(followSet))
        try {
            return logic()
        } finally {
            this.stack.pop()
        }
    }
    
    protected doVisitOptional<T>(symbol: Optional<T>): TokenTypeSet {
        symbol.symbol.accept(this)
        return merge(this.cached(symbol), this.top)
    }

    protected doVisitTerminal<T>(symbol: Terminal<T>): TokenTypeSet {
        return new Set()
    }

    protected doVisitChoice<P extends Repeatable<any>[]>(symbol: Choice<P>): TokenTypeSet {
        var set = symbol.productions
            .map(p => p.accept(this))
            .reduce(merge, new Set<tokens.TokenType<any>>())
        return set.size > 0 ? merge(this.cached(symbol), this.top) : new Set()
    }

    protected doVisitProduction<D extends Definition>(symbol: Production<D>): TokenTypeSet {
        let s = symbol.definition[symbol.order[symbol.order.length - 1]];
        let followSet = s.accept(this)
        for (let i = symbol.order.length - 2; i >= 0; i--) {
            const nextS = s 
            const nextFirstSet = this.firstSets.get(nextS) ?? new Set()
            s = symbol.definition[symbol.order[i]]
            followSet = this.enter(merge(followSet, nextFirstSet), () => s.accept(this))
        }
        return this.optionality.get(symbol) ? merge(this.cached(symbol), this.top) : new Set()
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
    return recursively("con", (self: Repeatable<Con<T>>) => {
        const list = self.optional()
        const con = production({ head: symbol, tail: list })
        return { list, con }
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
