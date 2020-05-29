import * as tokens from "./tokens";
export declare type InferFrom<S extends Symbol<any>> = S extends Symbol<infer T> ? T : never;
export declare type ParseTreeNode<T extends string, S extends Structure> = {
    type: T;
    content: S;
};
export declare type DefinitionOf<S extends Structure> = {
    [k in keyof S]: Symbol<S[k]>;
};
export declare type Structure = Record<string, any>;
export declare abstract class Grammar<T> {
    readonly symbols: Symbol<any>[];
    abstract get start(): Symbol<T>;
    private add;
    protected terminal<T>(tokenType: tokens.TokenType<T>): TerminalImpl<T>;
    protected choice<N extends Symbol<ParseTreeNode<string, Structure>>>(productions: () => N[]): ChoiceImpl<N>;
    protected sentence<T extends string, S extends Structure>(type: T, definition: DefinitionOf<S>): SentenceImpl<T, S>;
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
    accept<R>(visitor: Visitor<R>): R;
}
export interface Optional<T> extends Symbol<T | null> {
    readonly symbol: RepeatableSymbol<T>;
}
export interface ZeroOrMore<T> extends Symbol<T[]> {
    readonly symbol: RepeatableSymbol<T>;
}
export interface OneOrMore<T> extends Symbol<[T, ...T[]]> {
    readonly symbol: RepeatableSymbol<T>;
}
export interface RepeatableSymbol<T> extends Symbol<T> {
    optional(): Optional<T>;
    zeroOrMore(): ZeroOrMore<T>;
    oneOrMore(): OneOrMore<T>;
}
export interface Terminal<T> extends RepeatableSymbol<T> {
    readonly tokenType: tokens.TokenType<T>;
}
export interface Choice<N extends Symbol<ParseTreeNode<string, Structure>>> extends RepeatableSymbol<InferFrom<N>> {
    readonly productions: N[];
}
export interface Sentence<T extends string, S extends Structure> extends RepeatableSymbol<ParseTreeNode<T, S>> {
    readonly type: T;
    readonly definition: DefinitionOf<S>;
}
declare abstract class SymbolImpl<T> implements Symbol<T> {
    abstract accept<R>(visitor: Visitor<R>): R;
}
declare abstract class RepeatableSymbolImpl<T> extends SymbolImpl<T> implements RepeatableSymbol<T> {
    optional(): Optional<T>;
    zeroOrMore(): ZeroOrMore<T>;
    oneOrMore(): OneOrMore<T>;
}
declare class TerminalImpl<T> extends RepeatableSymbolImpl<T> implements Terminal<T> {
    readonly tokenType: tokens.TokenType<T>;
    constructor(tokenType: tokens.TokenType<T>);
    accept<R>(visitor: Visitor<R>): R;
}
declare class ChoiceImpl<N extends Symbol<ParseTreeNode<string, Structure>>> extends RepeatableSymbolImpl<InferFrom<N>> implements Choice<N> {
    private productionsSupplier;
    private _productions;
    constructor(productionsSupplier: () => N[]);
    get productions(): N[];
    accept<R>(visitor: Visitor<R>): R;
}
declare class SentenceImpl<T extends string, S extends Structure> extends RepeatableSymbolImpl<ParseTreeNode<T, S>> implements Sentence<T, S> {
    readonly type: T;
    readonly definition: DefinitionOf<S>;
    constructor(type: T, definition: DefinitionOf<S>);
    accept<R>(visitor: Visitor<R>): R;
}
export {};
