import * as tokens from "./tokens";

export class Grammar<T> {

    readonly optionality: Map<Symbol<any>, boolean> = this.apply(new OptionalityChecker())
    readonly firstSets: Map<Symbol<any>, TokenTypeSet> = this.apply(new FirstSetDeriver(this.optionality))
    readonly followSets: Map<Symbol<any>, TokenTypeSet> = this.apply(new FollowSetDeriver(this.firstSets))
    readonly symbols: Set<Symbol<any>> = new Set(this.optionality.keys())
    
    constructor(readonly start: Symbol<T>) {
    }

    private apply<R>(visitor: RecursiveVisitor<R>): Map<Symbol<any>, R> {
        this.start.accept(visitor)
        return visitor.cache
    }

}

export type InferFrom<S extends Symbol<any>> = S extends Symbol<infer T> ? T : never 
export type InferFromNodes<P extends Node<any>[]> = 
      P extends [infer H extends Node<any>] ? InferFrom<H>
    : P extends [infer H extends Node<any>, ...infer T extends Node<any>[]] ? InferFrom<H> | InferFromNodes<T> 
    : never 
export type Structure<D extends Definition> = {
    [k in keyof D]: InferFrom<D[k]>
}
export type ParseTreeNode<T extends string, S extends Structure<any>> = {
    type: T,
    content: S
}

export type Definition = Record<string, Symbol<any>>
export type TokenTypeSet = Set<tokens.TokenType<any>>

export function terminal<T>(tokenType: tokens.TokenType<T>): Terminal<T> {
    return new TerminalImpl(tokenType)
}

export function choice<P extends [Node<any>, Node<any>, ...Node<any>[]]>(...productions: P): Choice<P> {
    return new ChoiceImpl(productions)
}

export function production<T extends string, D extends Definition>(type: T, definition: D, order: (keyof D)[] = Object.keys(definition)): Production<T, D> {
    return new ProductionImpl(type, definition, order)
}

export function recursively<T>(symbolSupplier: () => Node<T>) {
    return new LazyImpl(symbolSupplier)
}

export interface Symbol<T> {

    accept<R>(visitor: Visitor<R>): R

    process(value: T): void

}

export interface Optional<T> extends Symbol<T | null> {

    readonly symbol: Repeatable<T>

}

export interface ZeroOrMore<T> extends Symbol<T[]> {

    readonly symbol: Repeatable<T> 

}

export interface OneOrMore<T> extends Symbol<[T, ...T[]]> {

    readonly symbol: Repeatable<T> 

}

export interface Repeatable<T> extends Symbol<T> {

    optional(): Optional<T>
    zeroOrMore(): ZeroOrMore<T>
    oneOrMore(): OneOrMore<T>

}

export interface Terminal<T> extends Repeatable<T> {

    readonly tokenType: tokens.TokenType<T>

}

export interface Node<T> extends Repeatable<T> {

    readonly kind: "choice" | "production"

}

export interface Choice<P extends Node<any>[]> extends Node<InferFromNodes<P>> {

    readonly productions: P

}

export interface Production<T extends string, D extends Definition> extends Node<ParseTreeNode<T, Structure<D>>> {

    readonly type: T
    readonly definition: D
    readonly order: (keyof D)[]

}

export interface Lazy<T> extends Repeatable<T> {

    readonly symbol: Node<T>

}

abstract class SymbolImpl<T> implements Symbol<T> {

    abstract accept<R>(visitor: Visitor<R>): R
    
    process(value: T) {}

}

class OptionalImpl<T> extends SymbolImpl<T | null> implements Optional<T> {

    constructor(readonly symbol: Repeatable<T>) {
        super()
    } 

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitOptional(this)
    }

}

class ZeroOrMoreImpl<T> extends SymbolImpl<T[]> implements ZeroOrMore<T> {

    constructor(readonly symbol: Repeatable<T>) {
        super()
    }

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitZeroOrMore(this)
    }

}

class OneOrMoreImpl<T> extends SymbolImpl<[T, ...T[]]> implements OneOrMore<T> {

    constructor(readonly symbol: Repeatable<T>) {
        super()
    } 

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitOneOrMore(this)
    }

}

abstract class RepeatableImpl<T> extends SymbolImpl<T> implements Repeatable<T> {

    optional(): Optional<T> {
        return new OptionalImpl(this)
    }

    zeroOrMore(): ZeroOrMore<T> {
        return new ZeroOrMoreImpl(this)
    }

    oneOrMore(): OneOrMore<T> {
        return new OneOrMoreImpl(this)
    }

}

class TerminalImpl<T> extends RepeatableImpl<T> implements Terminal<T> {

    constructor(readonly tokenType: tokens.TokenType<T>) {
        super()
    }

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitTerminal(this)
    }

}

class ChoiceImpl<P extends Node<any>[]> extends RepeatableImpl<InferFromNodes<P>> implements Choice<P> {

    readonly kind = "choice"
    
    constructor(readonly productions: P) {
        super()
    }

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitChoice(this)
    }

}

class ProductionImpl<T extends string, D extends Definition> extends RepeatableImpl<ParseTreeNode<T, Structure<D>>> implements Production<T, D> {

    readonly kind = "production"
    
    constructor(readonly type: T, readonly definition: D, readonly order: (keyof D)[]) {
        super()
    }

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitProduction(this)
    }

}

class LazyImpl<S> extends RepeatableImpl<S> implements Lazy<S> {

    private _symbol: Node<S> | null = null

    constructor(private symbolSupplier: () => Node<S>) {
        super()
    }

    get symbol(): Node<S> {
        if (this._symbol === null) {
            this._symbol = this.symbolSupplier()
        }
        return this._symbol
    } 
    
    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitLazy(this)
    }
    
}

export interface Visitor<R> {
    visitOptional<T>(symbol: Optional<T>): R;
    visitZeroOrMore<T>(symbol: ZeroOrMore<T>): R;
    visitOneOrMore<T>(symbol: OneOrMore<T>): R;
    visitTerminal<T>(symbol: Terminal<T>): R;
    visitChoice<P extends Node<any>[]>(symbol: Choice<P>): R;
    visitProduction<T extends string, D extends Definition>(symbol: Production<T, D>): R;
    visitLazy<S>(symbol: Lazy<S>): R;
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
            if (!this.reprocessCached && result !== undefined) {
                return result
            }
            result = resultSupplier(symbol)
            this.cache.set(symbol, result)
            return result
        } finally {
            this.visited.delete(symbol)
        }
    }

    visitOptional<T>(symbol: Optional<T>): R {
        return this.pass(symbol, s => this.doVisitOptional(s))
    }

    visitZeroOrMore<T>(symbol: ZeroOrMore<T>): R {
        return this.pass(symbol, s => this.doVisitZeroOrMore(s))
    }

    visitOneOrMore<T>(symbol: OneOrMore<T>): R {
        return this.pass(symbol, s => this.doVisitOneOrMore(s))
    }

    visitTerminal<T>(symbol: Terminal<T>): R {
        return this.pass(symbol, s => this.doVisitTerminal(s))
    }

    visitChoice<P extends Node<any>[]>(symbol: Choice<P>): R {
        return this.pass(symbol, s => this.doVisitChoice(s))
    }

    visitProduction<T extends string, D extends Definition>(symbol: Production<T, D>): R {
        return this.pass(symbol, s => this.doVisitProduction(s))
    }

    visitLazy<S>(symbol: Lazy<S>): R {
        return this.pass(symbol, s => this.doVisitLazy(s))
    }

    doVisitLazy<S>(symbol: Lazy<S>): R {
        return symbol.symbol.accept(this)
    }

    protected abstract doVisitOptional<T>(symbol: Optional<T>): R
    protected abstract doVisitZeroOrMore<T>(symbol: ZeroOrMore<T>): R
    protected abstract doVisitOneOrMore<T>(symbol: OneOrMore<T>): R
    protected abstract doVisitTerminal<T>(symbol: Terminal<T>): R
    protected abstract doVisitChoice<P extends Node<any>[]>(symbol: Choice<P>): R
    protected abstract doVisitProduction<T extends string, D extends Definition>(symbol: Production<T, D>): R

} 

class OptionalityChecker extends RecursiveVisitor<boolean> {

    constructor() {
        super(false, () => false)
    }

    protected doVisitOptional<T>(symbol: Optional<T>): boolean {
        return true
    }

    protected doVisitZeroOrMore<T>(symbol: ZeroOrMore<T>): boolean {
        return true
    }

    protected doVisitOneOrMore<T>(symbol: OneOrMore<T>): boolean {
        return symbol.symbol.accept(this)
    }

    protected doVisitTerminal<T>(symbol: Terminal<T>): boolean {
        return false
    }

    protected doVisitChoice<P extends Node<any>[]>(symbol: Choice<P>): boolean {
        return symbol.productions.some(p => p.accept(this))
    }

    protected doVisitProduction<T extends string, D extends Definition>(symbol: Production<T, D>): boolean {
        return symbol.order.every(k => symbol.definition[k].accept(this))
    }
    
}

class FirstSetDeriver extends RecursiveVisitor<TokenTypeSet> {

    constructor(private optionality: Map<Symbol<any>, boolean>) {
        super(false, () => new Set());
    }
    
    protected doVisitOptional<T>(symbol: Optional<T>): TokenTypeSet {
        return symbol.symbol.accept(this)
    }

    protected doVisitZeroOrMore<T>(symbol: ZeroOrMore<T>): TokenTypeSet {
        return symbol.symbol.accept(this)
    }

    protected doVisitOneOrMore<T>(symbol: OneOrMore<T>): TokenTypeSet {
        return symbol.symbol.accept(this)
    }

    protected doVisitTerminal<T>(symbol: Terminal<T>): TokenTypeSet {
        return new Set([symbol.tokenType])
    }

    protected doVisitChoice<P extends Node<any>[]>(symbol: Choice<P>): TokenTypeSet {
        return symbol.productions
            .map(p => p.accept(this))
            .reduce(merge, new Set<tokens.TokenType<any>>())
    }

    protected doVisitProduction<T extends string, D extends Definition>(symbol: Production<T, D>): TokenTypeSet {
        const firstNonOptional = symbol.order.findIndex(k => this.optionality.get(symbol.definition[k]))
        const keys = firstNonOptional > 0 ? symbol.order.slice(0, firstNonOptional + 1) : symbol.order
        return keys
            .map(k => symbol.definition[k].accept(this))
            .reduce(merge, new Set<tokens.TokenType<any>>())
    }

}

class FollowSetDeriver extends RecursiveVisitor<TokenTypeSet> {

    private stack: TokenTypeSet[] = [new Set()]

    constructor(private firstSets: Map<Symbol<any>, TokenTypeSet>) {
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

    protected doVisitZeroOrMore<T>(symbol: ZeroOrMore<T>): TokenTypeSet {
        symbol.symbol.accept(this)
        return merge(this.cached(symbol), this.top)
    }

    protected doVisitOneOrMore<T>(symbol: OneOrMore<T>): TokenTypeSet {
        const set = symbol.symbol.accept(this)
        return set.size > 0 ? merge(this.cached(symbol), this.top) : new Set()
    }

    protected doVisitTerminal<T>(symbol: Terminal<T>): TokenTypeSet {
        return new Set()
    }

    protected doVisitChoice<P extends Node<any>[]>(symbol: Choice<P>): TokenTypeSet {
        var set = symbol.productions
            .map(p => p.accept(this))
            .reduce(merge, new Set<tokens.TokenType<any>>())
        return set.size > 0 ? merge(this.cached(symbol), this.top) : new Set()
    }

    protected doVisitProduction<T extends string, D extends Definition>(symbol: Production<T, D>): TokenTypeSet {
        let s = symbol.definition[symbol.order[symbol.order.length - 1]];
        let followSet = s.accept(this)
        for (let i = symbol.order.length - 2; i >= 0; i--) {
            const nextS = s 
            const nextFirstSet = this.firstSets.get(nextS) ?? new Set()
            s = symbol.definition[symbol.order[i]]
            followSet = this.enter(merge(followSet, nextFirstSet), () => s.accept(this))
        }
        return followSet.size > 0 ? merge(this.cached(symbol), this.top) : new Set()
    }

}

function merge<T>(s1: Set<T>, s2: Set<T>): Set<T> {
    return new Set([...s1, ...s2])
}
