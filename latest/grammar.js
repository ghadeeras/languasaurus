import * as utils from "./utils.js";
export class Grammar {
    constructor(start) {
        this.start = start;
        this.optionality = this.apply(new OptionalityChecker());
        this.firstSets = this.apply(new FirstSetDeriver(this.optionality));
        this.followSets = this.apply(new FollowSetDeriver(this.optionality, this.firstSets));
        this.symbols = new Set(this.optionality.keys());
    }
    apply(visitor) {
        this.start.accept(visitor);
        return visitor.cache;
    }
    isOptional(symbol) {
        var _a;
        return (_a = this.optionality.get(symbol)) !== null && _a !== void 0 ? _a : this.notFound(symbol);
    }
    firstSetOf(symbol) {
        var _a;
        return (_a = this.firstSets.get(symbol)) !== null && _a !== void 0 ? _a : this.notFound(symbol);
    }
    followSetOf(symbol) {
        var _a;
        return (_a = this.followSets.get(symbol)) !== null && _a !== void 0 ? _a : this.notFound(symbol);
    }
    notFound(symbol) {
        throw new Error("Symbol not found: " + symbol);
    }
}
export function terminal(tokenType) {
    return new TerminalImpl(tokenType);
}
export function choice(...productions) {
    return new ChoiceImpl(productions);
}
export function production(definition, order = Object.keys(definition)) {
    return new ProductionImpl(definition, order);
}
export function recursively(definition) {
    const result = [];
    new LazyImpl(self => {
        const [s, r] = definition(self);
        result.push(r);
        return s;
    });
    return result[0];
}
class SymbolImpl {
    random() {
        return utils.evaluate(evaluator => this.asyncRandom(evaluator, 0));
    }
}
class NonRepeatableImpl extends SymbolImpl {
    mapped(toMapper, fromMapper) {
        return new MappedNonRepeatableImpl(this, toMapper, fromMapper);
    }
    typedAs(type) {
        return this.mapped(node => ({ type, content: node }), node => node.content);
    }
}
class RepeatableImpl extends SymbolImpl {
    optional() {
        return new OptionalImpl(this);
    }
    zeroOrMore() {
        return zeroOrMore(this);
    }
    oneOrMore() {
        return oneOrMore(this);
    }
    mapped(toMapper, fromMapper) {
        return new MappedRepeatableImpl(this, toMapper, fromMapper);
    }
    typedAs(type) {
        return new TypedRepeatableImpl(type, this);
    }
}
class OptionalImpl extends NonRepeatableImpl {
    constructor(symbol) {
        super();
        this.symbol = symbol;
        this.size = this.symbol.size + 1;
    }
    accept(visitor) {
        return visitor.visitOptional(this);
    }
    asyncRandom(evaluator, depth = 0) {
        const dice = Math.random() * this.size * (Math.pow(2, (-depth / 256)));
        return (dice > 1
            ? this.symbol.asyncRandom(evaluator, depth)
            : evaluator(() => null));
    }
    *tokens(value) {
        if (value !== null) {
            for (const t of this.symbol.tokens(value)) {
                yield t;
            }
        }
        ;
    }
}
class TerminalImpl extends RepeatableImpl {
    constructor(tokenType) {
        super();
        this.tokenType = tokenType;
        this.size = 1;
    }
    accept(visitor) {
        return visitor.visitTerminal(this);
    }
    asyncRandom(evaluator) {
        return evaluator(() => this.tokenType.parse(this.tokenType.pattern.randomString(0.125)));
    }
    *tokens(value) {
        yield this.tokenType.token(this.tokenType.stringify(value), { line: 0, column: 0, index: 0 });
    }
}
class ChoiceImpl extends RepeatableImpl {
    constructor(productions) {
        super();
        this.productions = productions;
        this.kind = "choice";
        this.size = this.productions.map(p => p.size).reduce((a, b) => a + b, 0);
    }
    accept(visitor) {
        return visitor.visitChoice(this);
    }
    asyncRandom(evaluator, depth = 0) {
        let dice = utils.randomInt(this.size);
        let i = 0;
        while (dice > this.productions[i].size) {
            dice -= this.productions[i++].size;
        }
        return this.productions[i].asyncRandom(evaluator, depth);
    }
    *tokens(value) {
        for (const p of this.productions) {
            if (p.type === value.type) {
                for (const t of p.tokens(value)) {
                    yield t;
                }
            }
        }
    }
}
class ProductionImpl extends RepeatableImpl {
    constructor(definition, order) {
        super();
        this.definition = definition;
        this.order = order;
        this.kind = "production";
        this.size = this.order.map(k => this.definition[k].size).reduce((a, b) => a * b, 1);
    }
    accept(visitor) {
        return visitor.visitProduction(this);
    }
    asyncRandom(evaluator, depth = 0) {
        let content = evaluator(() => ({}));
        for (const key of this.order) {
            content = content.then(c => {
                const value = this.definition[key].asyncRandom(evaluator, depth + 1);
                return value.then(v => {
                    c[key] = v;
                    return c;
                });
            });
        }
        return content;
    }
    *tokens(value) {
        for (const k of this.order) {
            if (k in value) {
                for (const t of this.definition[k].tokens(value[k])) {
                    yield t;
                }
            }
        }
        ;
    }
}
class LazyImpl extends RepeatableImpl {
    constructor(symbolSupplier) {
        super();
        this.size = 1;
        this.symbol = symbolSupplier(this);
    }
    accept(visitor) {
        return visitor.visitLazy(this);
    }
    asyncRandom(evaluator, depth = 0) {
        return this.symbol.asyncRandom(evaluator, depth);
    }
    tokens(value) {
        return this.symbol.tokens(value);
    }
}
class MappedNonRepeatableImpl extends NonRepeatableImpl {
    constructor(symbol, toMapper, fromMapper) {
        super();
        this.symbol = symbol;
        this.toMapper = toMapper;
        this.fromMapper = fromMapper;
        this.size = this.symbol.size;
    }
    accept(visitor) {
        return visitor.visitMappedNonRepeatable(this);
    }
    asyncRandom(evaluator, depth = 0) {
        return this.symbol.asyncRandom(evaluator, depth).then(this.toMapper);
    }
    tokens(value) {
        return this.symbol.tokens(this.fromMapper(value));
    }
}
class MappedRepeatableImpl extends RepeatableImpl {
    constructor(symbol, toMapper, fromMapper) {
        super();
        this.symbol = symbol;
        this.toMapper = toMapper;
        this.fromMapper = fromMapper;
        this.size = this.symbol.size;
    }
    accept(visitor) {
        return visitor.visitMappedRepeatable(this);
    }
    asyncRandom(evaluator, depth) {
        return this.symbol.asyncRandom(evaluator, depth).then(this.toMapper);
    }
    tokens(value) {
        return this.symbol.tokens(this.fromMapper(value));
    }
}
class TypedRepeatableImpl extends MappedRepeatableImpl {
    constructor(type, symbol) {
        super(symbol, node => ({ type, content: node }), node => node.content);
        this.type = type;
        this.symbol = symbol;
    }
}
class RecursiveVisitor {
    constructor(reprocessCached, recursiveValue) {
        this.reprocessCached = reprocessCached;
        this.recursiveValue = recursiveValue;
        this.visited = new Set();
        this.cache = new Map();
    }
    pass(symbol, resultSupplier) {
        if (this.visited.has(symbol)) {
            return this.recursiveValue();
        }
        this.visited.add(symbol);
        try {
            let result = this.cache.get(symbol);
            if (this.reprocessCached || result == undefined) {
                result = resultSupplier(symbol);
                this.cache.set(symbol, result);
            }
            return result;
        }
        finally {
            this.visited.delete(symbol);
        }
    }
    visitOptional(symbol) {
        return this.pass(symbol, s => this.doVisitOptional(s));
    }
    visitTerminal(symbol) {
        return this.pass(symbol, s => this.doVisitTerminal(s));
    }
    visitChoice(symbol) {
        return this.pass(symbol, s => this.doVisitChoice(s));
    }
    visitProduction(symbol) {
        return this.pass(symbol, s => this.doVisitProduction(s));
    }
    visitLazy(symbol) {
        return this.pass(symbol, s => this.doVisitLazy(s));
    }
    visitMappedNonRepeatable(symbol) {
        return this.pass(symbol, s => this.doVisitMappedNonRepeatable(s));
    }
    visitMappedRepeatable(symbol) {
        return this.pass(symbol, s => this.doVisitMappedRepeatable(s));
    }
    doVisitLazy(symbol) {
        return symbol.symbol.accept(this);
    }
    doVisitMappedNonRepeatable(symbol) {
        return symbol.symbol.accept(this);
    }
    doVisitMappedRepeatable(symbol) {
        return symbol.symbol.accept(this);
    }
}
class OptionalityChecker extends RecursiveVisitor {
    constructor() {
        super(false, () => false);
    }
    doVisitOptional(symbol) {
        symbol.symbol.accept(this);
        return true;
    }
    doVisitTerminal(symbol) {
        return false;
    }
    doVisitChoice(symbol) {
        return symbol.productions.reduce((a, p) => p.accept(this) || a, false);
    }
    doVisitProduction(symbol) {
        return symbol.order.reduce((a, k) => symbol.definition[k].accept(this) && a, true);
    }
}
class FirstSetDeriver extends RecursiveVisitor {
    constructor(optionality) {
        super(false, () => new Set());
        this.optionality = optionality;
    }
    doVisitOptional(symbol) {
        return symbol.symbol.accept(this);
    }
    doVisitTerminal(symbol) {
        return new Set([symbol.tokenType]);
    }
    doVisitChoice(symbol) {
        return symbol.productions
            .map(p => p.accept(this))
            .reduce(merge, new Set());
    }
    doVisitProduction(symbol) {
        const firstNonOptional = symbol.order.findIndex(k => !this.optionality.get(symbol.definition[k]));
        const keys = firstNonOptional > 0 ? symbol.order.slice(0, firstNonOptional + 1) : symbol.order;
        return keys
            .map(k => symbol.definition[k].accept(this))
            .reduce(merge, new Set());
    }
}
class FollowSetDeriver extends RecursiveVisitor {
    constructor(optionality, firstSets) {
        super(true, () => new Set());
        this.optionality = optionality;
        this.firstSets = firstSets;
        this.stack = [new Set()];
    }
    cached(symbol) {
        let result = this.cache.get(symbol);
        return result !== null && result !== void 0 ? result : new Set();
    }
    get top() {
        return new Set(this.stack[this.stack.length - 1]);
    }
    enter(followSet, logic) {
        this.stack.push(new Set(followSet));
        try {
            return logic();
        }
        finally {
            this.stack.pop();
        }
    }
    doVisitOptional(symbol) {
        symbol.symbol.accept(this);
        return merge(this.cached(symbol), this.top);
    }
    doVisitTerminal(symbol) {
        return new Set();
    }
    doVisitChoice(symbol) {
        var set = symbol.productions
            .map(p => p.accept(this))
            .reduce(merge, new Set());
        return set.size > 0 ? merge(this.cached(symbol), this.top) : new Set();
    }
    doVisitProduction(symbol) {
        var _a;
        let s = symbol.definition[symbol.order[symbol.order.length - 1]];
        let followSet = s.accept(this);
        for (let i = symbol.order.length - 2; i >= 0; i--) {
            const nextS = s;
            const nextFirstSet = (_a = this.firstSets.get(nextS)) !== null && _a !== void 0 ? _a : new Set();
            s = symbol.definition[symbol.order[i]];
            followSet = this.enter(merge(followSet, nextFirstSet), () => s.accept(this));
        }
        return this.optionality.get(symbol) ? merge(this.cached(symbol), this.top) : new Set();
    }
}
function merge(s1, s2) {
    return new Set([...s1, ...s2]);
}
function zeroOrMore(symbol) {
    return listProductions(symbol).list.mapped(n => toList(n), l => toLinkedList(l));
}
function oneOrMore(symbol) {
    return listProductions(symbol).con.mapped(n => toNonEmptyList(n), l => toCon(l));
}
function listProductions(symbol) {
    return recursively((self) => {
        const list = self.optional();
        const con = production({ head: symbol, tail: list });
        return [con, { list, con }];
    });
}
function toList(n) {
    const result = [];
    while (n !== null) {
        result.push(n.head);
        n = n.tail;
    }
    return result;
}
function toNonEmptyList(n) {
    return [n.head, ...toList(n.tail)];
}
function toLinkedList(l) {
    let tail = null;
    for (const head of l) {
        tail = { head, tail };
    }
    return tail;
}
function toCon(l) {
    return toLinkedList(l);
}