export class Grammar {
    constructor() {
        this.symbols = [];
    }
    add(symbol) {
        this.symbols.push(symbol);
        return symbol;
    }
    terminal(tokenType) {
        return this.add(new TerminalImpl(tokenType));
    }
    choice(productions) {
        return this.add(new ChoiceImpl(productions));
    }
    sentence(type, definition) {
        return this.add(new SentenceImpl(type, definition));
    }
}
class SymbolImpl {
}
class OptionalImpl extends SymbolImpl {
    constructor(symbol) {
        super();
        this.symbol = symbol;
    }
    accept(visitor) {
        return visitor.visitOptional(this);
    }
}
class ZeroOrMoreImpl extends SymbolImpl {
    constructor(symbol) {
        super();
        this.symbol = symbol;
    }
    accept(visitor) {
        return visitor.visitZeroOrMore(this);
    }
}
class OneOrMoreImpl extends SymbolImpl {
    constructor(symbol) {
        super();
        this.symbol = symbol;
    }
    accept(visitor) {
        return visitor.visitOneOrMore(this);
    }
}
class RepeatableSymbolImpl extends SymbolImpl {
    optional() {
        return new OptionalImpl(this);
    }
    zeroOrMore() {
        return new ZeroOrMoreImpl(this);
    }
    oneOrMore() {
        return new OneOrMoreImpl(this);
    }
}
class TerminalImpl extends RepeatableSymbolImpl {
    constructor(tokenType) {
        super();
        this.tokenType = tokenType;
    }
    accept(visitor) {
        return visitor.visitTerminal(this);
    }
}
class ChoiceImpl extends RepeatableSymbolImpl {
    constructor(productionsSupplier) {
        super();
        this.productionsSupplier = productionsSupplier;
        this._productions = [];
    }
    get productions() {
        if (this._productions.length == 0) {
            this._productions = this.productionsSupplier();
        }
        return this._productions;
    }
    accept(visitor) {
        return visitor.visitChoice(this);
    }
}
class SentenceImpl extends RepeatableSymbolImpl {
    constructor(type, definition) {
        super();
        this.type = type;
        this.definition = definition;
    }
    accept(visitor) {
        return visitor.visitSentence(this);
    }
}
