import * as tokens from "./tokens.js";
import { randomInt } from "./utils.js";

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

export function recursively<T>(symbolSupplier: () => Symbol<T>) {
    return new LazyImpl(symbolSupplier)
}

export interface Symbol<T> {

    accept<R>(visitor: Visitor<R>): R

    mapped<R>(toMapper: (v: T) => R, fromMapper: (v: R) => T): Mapped<T, R>

    random(): T

}

export interface Optional<T> extends Symbol<T | null> {

    readonly symbol: Repeatable<T>

}

export interface Repeatable<T> extends Symbol<T> {

    optional(): Optional<T>
    zeroOrMore(): Symbol<T[]>
    oneOrMore(): Symbol<[T, ...T[]]>

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

export interface Lazy<T> extends Symbol<T> {

    readonly symbol: Symbol<T>

}

export interface Mapped<S, T> extends Symbol<T> {

    readonly symbol: Symbol<S>
    readonly toMapper: (v: S) => T
    readonly fromMapper: (v: T) => S

}

abstract class SymbolImpl<T> implements Symbol<T> {

    abstract accept<R>(visitor: Visitor<R>): R

    abstract random(): T;
    
    mapped<R>(toMapper: (v: T) => R, fromMapper: (v: R) => T): Mapped<T, R> {
        return new MappedImpl(this, toMapper, fromMapper)
    }

}

class OptionalImpl<T> extends SymbolImpl<T | null> implements Optional<T> {

    constructor(readonly symbol: Repeatable<T>) {
        super()
    } 

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitOptional(this)
    }

    random(): T | null {
        return randomInt(2) === 1 ? this.symbol.random() : null
    }

}

abstract class RepeatableImpl<T> extends SymbolImpl<T> implements Repeatable<T> {

    optional(): Optional<T> {
        return new OptionalImpl(this)
    }

    zeroOrMore(): Symbol<T[]> {
        return zeroOrMore(this)
    }

    oneOrMore(): Symbol<[T, ...T[]]> {
        return oneOrMore(this)
    }

}

class TerminalImpl<T> extends RepeatableImpl<T> implements Terminal<T> {

    constructor(readonly tokenType: tokens.TokenType<T>) {
        super()
    }

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitTerminal(this)
    }
    
    random(): T {
        return this.tokenType.parse(this.tokenType.pattern.random())
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

    random(): InferFromNodes<P> {
        const i = randomInt(this.productions.length)
        return this.productions[i].random()
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

    random(): ParseTreeNode<T, Structure<D>> {
        const content: Partial<ParseTreeNode<T, Structure<D>>["content"]> = {}
        for (const key of this.order) {
            content[key] = this.definition[key].random()
        }
        return {
            type: this.type,
            content: content as ParseTreeNode<T, Structure<D>>["content"]
        }
    }

}

class LazyImpl<T> extends SymbolImpl<T> implements Lazy<T> {

    private _symbol: Symbol<T> | null = null

    constructor(private symbolSupplier: () => Symbol<T>) {
        super()
    }

    get symbol(): Symbol<T> {
        if (this._symbol === null) {
            this._symbol = this.symbolSupplier()
        }
        return this._symbol
    } 
    
    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitLazy(this)
    }

    random(): T {
        return this.symbol.random()
    }
    
}

class MappedImpl<S, T> extends SymbolImpl<T> implements Mapped<S, T> {

    constructor(readonly symbol: Symbol<S>, readonly toMapper: (v: S) => T, readonly fromMapper: (v: T) => S) {
        super()
    }

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitMapped(this)
    }

    random(): T {
        return this.toMapper(this.symbol.random())
    }

}

export interface Visitor<R> {
    visitOptional<T>(symbol: Optional<T>): R;
    visitTerminal<T>(symbol: Terminal<T>): R;
    visitChoice<P extends Node<any>[]>(symbol: Choice<P>): R;
    visitProduction<T extends string, D extends Definition>(symbol: Production<T, D>): R;
    visitLazy<S>(symbol: Lazy<S>): R;
    visitMapped<S, T>(symbol: Mapped<S, T>): R;
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

    visitChoice<P extends Node<any>[]>(symbol: Choice<P>): R {
        return this.pass(symbol, s => this.doVisitChoice(s))
    }

    visitProduction<T extends string, D extends Definition>(symbol: Production<T, D>): R {
        return this.pass(symbol, s => this.doVisitProduction(s))
    }

    visitLazy<S>(symbol: Lazy<S>): R {
        return this.pass(symbol, s => this.doVisitLazy(s))
    }

    visitMapped<S, T>(symbol: Mapped<S, T>): R {
        return this.pass(symbol, s => this.doVisitMapped(s))
    }

    doVisitLazy<S>(symbol: Lazy<S>): R {
        return symbol.symbol.accept(this)
    }

    doVisitMapped<S, T>(symbol: Mapped<S, T>): R {
        return symbol.symbol.accept(this)
    }

    protected abstract doVisitOptional<T>(symbol: Optional<T>): R
    protected abstract doVisitTerminal<T>(symbol: Terminal<T>): R
    protected abstract doVisitChoice<P extends Node<any>[]>(symbol: Choice<P>): R
    protected abstract doVisitProduction<T extends string, D extends Definition>(symbol: Production<T, D>): R

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

    protected doVisitChoice<P extends Node<any>[]>(symbol: Choice<P>): boolean {
        return symbol.productions.reduce((a, p) => p.accept(this) || a, false)
    }

    protected doVisitProduction<T extends string, D extends Definition>(symbol: Production<T, D>): boolean {
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

    protected doVisitChoice<P extends Node<any>[]>(symbol: Choice<P>): TokenTypeSet {
        return symbol.productions
            .map(p => p.accept(this))
            .reduce(merge, new Set<tokens.TokenType<any>>())
    }

    protected doVisitProduction<T extends string, D extends Definition>(symbol: Production<T, D>): TokenTypeSet {
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
        return this.optionality.get(symbol) ? merge(this.cached(symbol), this.top) : new Set()
    }

}

function merge<T>(s1: Set<T>, s2: Set<T>): Set<T> {
    return new Set([...s1, ...s2])
}

function zeroOrMore<T>(symbol: Repeatable<T>): Symbol<T[]> {
    return listSymbols(symbol).list.mapped<T[]>(n => toList(n), l => toLinkedList(l))
}

function oneOrMore<T>(symbol: Repeatable<T>): Symbol<[T, ...T[]]> {
    return listSymbols(symbol).con.mapped<[T, ...T[]]>(n => toNonEmptyList(n), l => toCon(l))
}

type LinkedList<T> = Con<T> | null
type Con<T> = ParseTreeNode<"con", {
    head: T
    tail: LinkedList<T>
}>

function listSymbols<T>(symbol: Symbol<T>) {
    const list = recursively(() => con.optional())
    const con: Node<Con<T>> = production("con", { head: symbol, tail: list })
    return { list, con }
}

function toList<T>(n: LinkedList<T>): T[] {
    return n !== null ? toNonEmptyList<T>(n) : [];
}

function toNonEmptyList<T>(n: Con<T>): [T, ...T[]] {
    return [n.content.head, ...toList(n.content.tail)];
}

function toLinkedList<T>(l: T[]): LinkedList<T> {
    return l.length > 0 ? toCon<T>(l) : null;
}

function toCon<T>(l: T[]): Con<T> {
    return {
        type: "con",
        content: {
            head: l[0],
            tail: toLinkedList(l.slice(1))
        }
    };
}
