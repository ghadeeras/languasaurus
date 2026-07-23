import * as gram from "./grammar.js"
import * as lex from "./scanning.js"
import * as tokens from "./tokens.js"
import { TextInputStream } from "./streams.js"
import { Consumer } from "./utils.js"

export function recursiveDescentParser<T, D extends lex.TokenDefinitions>(
    tokenDefinitions: D, 
    start: gram.Symbol<T>, 
    errorReporterFactory: (scanner: lex.Scanner<any>) => ParsingErrorReporter = scanner => new DefaultParsingErrorReporter(scanner),
    whitespace: Set<tokens.TokenType<any>> | undefined = undefined,
): (input: TextInputStream) => T {
    const grammar = new gram.Grammar(start)
    const problems = grammar.ll1EligiblityProblems()
    if (problems.length > 0) {
        throw new Error("Grammar is not LL(1) compatible. Problems:\n" + problems.map(p => " - " + p).join("\n"))
    }
    const ws = whitespace ?? inferWhiteSpaceTokens<T, D>(tokenDefinitions, grammar)
    const scanner = new lex.Scanner(tokenDefinitions)
    const errorReporter = errorReporterFactory(scanner)
    const visitor = new RecursiveDescentParsing(grammar, errorReporter)
    return stream => {
        const input = new LookAhead(scanner.iterator(stream), ws, errorReporter.invalidToken.bind(errorReporter))
        return visitor.accept(grammar.start, input)
    }
}

export interface ParsingErrorReporter {

    invalidToken(errorToken: tokens.Token<any>): void

    unexpectedToken(errorToken: tokens.Token<any>, ...expected: Set<tokens.TokenType<any>>[]): void

}

export class DefaultParsingErrorReporter implements ParsingErrorReporter {

    constructor(private scanner: lex.Scanner<any>, private errorConsumer: Consumer<string> = error => console.error(error)) {}

    invalidToken(errorToken: tokens.Token<any>): void {
        this.errorConsumer(`[${errorToken.position.line}:${errorToken.position.column}] Invalid token: '${errorToken.lexeme}'`)
    }

    unexpectedToken(errorToken: tokens.Token<any>, ...expected: Set<tokens.TokenType<any>>[]): void {
        const expectedTokens = expected
            .flatMap(set => Array.from(set))
            .map(t => t.random(errorToken.position))
            .map(t => t.tokenType !== tokens.eof ? `${this.name(t)} (e.g. '${t.lexeme}')` : this.name(t))
        const errorTokenTypeName = this.name(errorToken)
        this.errorConsumer(`[${errorToken.position.line}:${errorToken.position.column}] Unexpected ${errorTokenTypeName} token: '${errorToken.lexeme}'. Expected one of:\n - ${expectedTokens.join("\n - ")}`)
    }

    private name(errorToken: tokens.Token<any>) {
        return "<" + this.scanner.tokenTypeName(errorToken.tokenType).toString() + ">"
    }

}

export class LookAhead {

    private _current: tokens.Token<any> = this.next()

    constructor(
        private iterator: Generator<tokens.Token<any>, any, tokens.Token<any>>, 
        private whiteSpaceTokens: Set<tokens.TokenType<any>>,
        private errorReporter: (errorToken: tokens.Token<any>) => void
    ) {}

    get current(): tokens.Token<any> {
        return this._current
    }

    advance(): tokens.Token<any> {
        const current = this._current
        if (current.tokenType === tokens.eof) {
            return current
        }
        this._current = this.next()
        return current
    }


    private next() {
        let current = this._current
        while (true) {
            const next = this.iterator.next()
            if (next.done) {
                current = tokens.eof.random({ 
                    line: current.position.line, 
                    column: current.position.column + current.lexeme.length, 
                    index: current.position.index + current.lexeme.length 
                })
                break
            }
            if (this.whiteSpaceTokens.has(next.value.tokenType)) {
                continue
            }
            if (next.value.tokenType === tokens.error) {
                this.errorReporter(next.value)
                continue
            }
            current = next.value
            break
        }
        return current
    }
}

export interface ParsingVisitor {
    visitTerminal<T>(symbol: gram.Terminal<T>, input: LookAhead): tokens.Token<T>;
    visitOptional<T>(acceptor: ParsingVisitorAcceptor, symbol: gram.Optional<T>, input: LookAhead): T | null;
    visitChoice<P extends gram.Definition>(acceptor: ParsingVisitorAcceptor, symbol: gram.Choice<P>, input: LookAhead): gram.Cases<P>;
    visitProduction<D extends gram.Definition>(acceptor: ParsingVisitorAcceptor, symbol: gram.Production<D>, input: LookAhead): gram.Structure<D>;
    visitLazy<T>(acceptor: ParsingVisitorAcceptor, symbol: gram.Recursive<T>, input: LookAhead): T;
    visitMappedNonRepeatable<S, T>(acceptor: ParsingVisitorAcceptor, symbol: gram.MappedNonRepeatable<S, T>, input: LookAhead): T;
    visitMappedRepeatable<S, T>(acceptor: ParsingVisitorAcceptor, symbol: gram.MappedRepeatable<S, T>, input: LookAhead): T;
}

export interface ParsingVisitorAcceptor {

    accept<T>(symbol: gram.Symbol<T>, input: LookAhead): T

}

export class RecursiveDescentParsing implements gram.Visitor<LookAhead, any>, ParsingVisitorAcceptor {

    private visitor = new RecursiveDescentParsingVisitor(this.grammar, this.errorReporter)
    
    constructor(private grammar: gram.Grammar<any>, private errorReporter: ParsingErrorReporter) {}

    accept<T>(symbol: gram.Symbol<T>, input: LookAhead): T {
        return symbol.accept(this, input) as T
    }

    visitTerminal<T>(symbol: gram.Terminal<T>, input: LookAhead) {
        return this.visitor.visitTerminal(symbol, input)
    }

    visitOptional<T>(symbol: gram.Optional<T>, input: LookAhead) {
        return this.visitor.visitOptional(this, symbol, input)
    }

    visitChoice<P extends gram.Definition>(symbol: gram.Choice<P>, input: LookAhead) {
        return this.visitor.visitChoice(this, symbol, input)
    }

    visitProduction<D extends gram.Definition>(symbol: gram.Production<D>, input: LookAhead) {
        return this.visitor.visitProduction(this, symbol, input)
    }

    visitRecursive<S>(symbol: gram.Recursive<S>, input: LookAhead) {
        return this.visitor.visitLazy(this, symbol, input)
    }

    visitMappedNonRepeatable<S, T>(symbol: gram.MappedNonRepeatable<S, T>, input: LookAhead) {
        return this.visitor.visitMappedNonRepeatable(this, symbol, input)
    }

    visitMappedRepeatable<S, T>(symbol: gram.MappedRepeatable<S, T>, input: LookAhead) {
        return this.visitor.visitMappedRepeatable(this, symbol, input)
    }

}

export class RecursiveDescentParsingVisitor implements ParsingVisitor {

    constructor(private grammar: gram.Grammar<any>, private errorReporter: ParsingErrorReporter) {}

    private mustSkip<T>(symbol: gram.Symbol<T>, current: tokens.Token<any>) {
        if (this.grammar.isOptional(symbol) && this.grammar.followSetOf(symbol).has(current.tokenType)) {
            return true
        }
        if (this.grammar.firstSetOf(symbol).has(current.tokenType)) {
            return false
        }
        this.errorReporter.unexpectedToken(current, 
            this.grammar.firstSetOf(symbol), 
            this.grammar.isOptional(symbol) ? this.grammar.followSetOf(symbol) : new Set()
        )
        return this.grammar.isOptional(symbol)
    }

    visitTerminal<T>(symbol: gram.Terminal<T>, input: LookAhead): tokens.Token<T> {
        const token = input.advance()
        return token.tokenType === symbol.tokenType
            ? token as tokens.Token<T>
            : symbol.tokenType.replacing(token)
    }

    visitOptional<T>(acceptor: ParsingVisitorAcceptor, symbol: gram.Optional<T>, input: LookAhead): T | null {
        return this.mustSkip(symbol, input.current)
            ? null
            : acceptor.accept(symbol.symbol, input)
    }

    visitChoice<P extends gram.Definition>(acceptor: ParsingVisitorAcceptor, symbol: gram.Choice<P>, input: LookAhead): gram.Cases<P> {
        const allProductions = Object.entries(symbol.productions)
        const productions = allProductions.filter(this.mustSkip(symbol, input.current)
            ? ([k, p]) => this.grammar.isOptional(p)
            : _ => true
        )
        for (const [k, p] of productions) {
            if (this.grammar.firstSetOf(p).has(input.current.tokenType)) {
                return ({ type: k, value: acceptor.accept(p, input) }) as gram.Cases<P>
            }
        }
        const [k, p] = productions.length > 0 ? productions[0] : allProductions[0]
        return ({ type: k, value: acceptor.accept(p, input) }) as gram.Cases<P>
    }

    visitProduction<D extends gram.Definition>(acceptor: ParsingVisitorAcceptor, symbol: gram.Production<D>, input: LookAhead): gram.Structure<D> {
        const result: Partial<gram.Structure<D>> = {}
        for (const k of symbol.order) {
            const key = k as keyof D
            const s = symbol.definition[k]
            result[key] = acceptor.accept(s, input)
        }
        return result as gram.Structure<D>
    }

    visitLazy<T>(acceptor: ParsingVisitorAcceptor, symbol: gram.Recursive<T>, input: LookAhead): T {
        return acceptor.accept(symbol.symbol, input)
    }

    visitMappedNonRepeatable<S, T>(acceptor: ParsingVisitorAcceptor, symbol: gram.MappedNonRepeatable<S, T>, input: LookAhead): T {
        return symbol.toMapper(acceptor.accept(symbol.symbol, input))
    }

    visitMappedRepeatable<S, T>(acceptor: ParsingVisitorAcceptor, symbol: gram.MappedRepeatable<S, T>, input: LookAhead): T {
        return symbol.toMapper(acceptor.accept(symbol.symbol, input))
    }

}

function inferWhiteSpaceTokens<T, D extends lex.TokenDefinitions>(tokensDefinitions: D, grammar: gram.Grammar<T>) {
    const whitespace = new Set(Object.values(tokensDefinitions))
    for (const symbol of grammar.symbols.keys()) {
        const firstSet = grammar.firstSetOf(symbol)
        for (const tokenType of firstSet) {
            whitespace.delete(tokenType)
        }
    }
    return whitespace
}
