import * as tokens from "./tokens";

export type InferFrom<S extends Symbol<any>> = S extends Symbol<infer T> ? T : never 
export type ParseTreeNode<T extends string, S extends Structure> = {
    type: T
    content: S
}
export type DefinitionOf<S extends Structure> = {
    [k in keyof S]: Symbol<S[k]>
}
export type Structure = Record<string, any>

export abstract class Grammar<T> {

    readonly symbols: Symbol<any>[] = []
    
    abstract get start(): Symbol<T>

    private add<S extends Symbol<any>>(symbol: S) {
        this.symbols.push(symbol)
        return symbol
    }

    protected terminal<T>(tokenType: tokens.TokenType<T>) {
        return this.add(new TerminalImpl(tokenType))
    }
    
    protected choice<N extends Symbol<ParseTreeNode<string, Structure>>>(productions: () => N[]) {
        return this.add(new ChoiceImpl(productions))
    }
    
    protected sentence<T extends string, S extends Structure>(type: T, definition: DefinitionOf<S>) {
        return this.add(new SentenceImpl(type, definition))
    }
    
}

export interface Visitor<R> {
    visitOptional<T>(symbol: Optional<T>): R;
    visitZeroOrMore<T>(symbol: ZeroOrMore<T>): R;
    visitOneOrMore<T>(symbol: OneOrMore<T>): R;
    visitTerminal<T>(symbol: Terminal<T>): R;
    visitChoice<N extends Symbol<any>>(symbol: Choice<N>): R;
    visitSentence<T extends string, S extends Structure>(symbol: Sentence<T, S>): R;
}

export interface Symbol<T> {

    accept<R>(visitor: Visitor<R>): R

}

export interface Optional<T> extends Symbol<T | null> {

    readonly symbol: RepeatableSymbol<T>

}

export interface ZeroOrMore<T> extends Symbol<T[]> {

    readonly symbol: RepeatableSymbol<T> 

}

export interface OneOrMore<T> extends Symbol<[T, ...T[]]> {

    readonly symbol: RepeatableSymbol<T> 

}

export interface RepeatableSymbol<T> extends Symbol<T> {

    optional(): Optional<T>
    zeroOrMore(): ZeroOrMore<T>
    oneOrMore(): OneOrMore<T>

}

export interface Terminal<T> extends RepeatableSymbol<T> {

    readonly tokenType: tokens.TokenType<T>

}

export interface Choice<N extends Symbol<ParseTreeNode<string, Structure>>> extends RepeatableSymbol<InferFrom<N>> {

    readonly productions: N[]

}

export interface Sentence<T extends string, S extends Structure> extends RepeatableSymbol<ParseTreeNode<T, S>> {

    readonly type: T
    readonly definition: DefinitionOf<S>

}

abstract class SymbolImpl<T> implements Symbol<T> {

    abstract accept<R>(visitor: Visitor<R>): R
    
}

class OptionalImpl<T> extends SymbolImpl<T | null> implements Optional<T> {

    constructor(readonly symbol: RepeatableSymbol<T>) {
        super()
    } 

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitOptional(this)
    }

}

class ZeroOrMoreImpl<T> extends SymbolImpl<T[]> implements ZeroOrMore<T> {

    constructor(readonly symbol: RepeatableSymbol<T>) {
        super()
    }

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitZeroOrMore(this)
    }

}

class OneOrMoreImpl<T> extends SymbolImpl<[T, ...T[]]> implements OneOrMore<T> {

    constructor(readonly symbol: RepeatableSymbol<T>) {
        super()
    } 

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitOneOrMore(this)
    }

}

abstract class RepeatableSymbolImpl<T> extends SymbolImpl<T> implements RepeatableSymbol<T> {

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

class TerminalImpl<T> extends RepeatableSymbolImpl<T> implements Terminal<T> {

    constructor(readonly tokenType: tokens.TokenType<T>) {
        super()
    }

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitTerminal(this)
    }

}

class ChoiceImpl<N extends Symbol<ParseTreeNode<string, Structure>>> extends RepeatableSymbolImpl<InferFrom<N>> implements Choice<N> {

    private _productions: N[] = []

    constructor(private productionsSupplier: () => N[]) {
        super()
    }

    get productions(): N[] {
        if (this._productions.length == 0) {
            this._productions = this.productionsSupplier()
        }
        return this._productions
    }

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitChoice(this)
    }

}

class SentenceImpl<T extends string, S extends Structure> extends RepeatableSymbolImpl<ParseTreeNode<T, S>> implements Sentence<T, S> {

    constructor(readonly type: T, readonly definition: DefinitionOf<S>) {
        super()
    }

    accept<R>(visitor: Visitor<R>): R {
        return visitor.visitSentence(this)
    }

}
