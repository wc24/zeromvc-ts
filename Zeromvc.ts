/**
 * 蓝面包（wc24@qq.com)
 * 2025 02 07
 * 精简mvc设计模块
 */

type CommandType<T extends Command> = new (...args: any[]) => T
type ViewType = new () => View

export class InstancePool {
    private instanceMap: Map<any, any> = new Map()
    getSingle<T>(singleType: (new (...args: any[]) => T), ...args: any[]): T {
        let single: any
        if (this.instanceMap.has(singleType)) {
            single = this.instanceMap.get(singleType)!
        } else {
            single = new singleType(...args)
            if (single.init != null) {
                single.init()
            }
            if (single.start != null) {
                single.start()
            }
            this.instanceMap.set(singleType, single)
        }
        return <T>single
    }
    reStartInstance() {
        this.instanceMap.forEach((model) => {
            model.start()
        })
    }
    reset() {
        this.instanceMap = new Map()
    }
}

/**
 * 一条命令
 */
export class Command {
}
/**
 * 框架主类
 */
export class Zeromvc {
    protected pool: Map<any, any> = new Map()
    static modelPool: InstancePool = new InstancePool()
    protected showViewList: (ViewType)[] = [];
    static zeromvc: Zeromvc
    static strict = true
    constructor() {
        if (Zeromvc.zeromvc != null) {
            Zeromvc.zeromvc.clear()
        }
        Zeromvc.zeromvc = this
        this.initControl()
    }

    async command(command: Command): Promise<any>
    async command(command: string, ...args: any[]): Promise<any>
    async command(command: any, ...args: any[]) {
        if (command instanceof Command) {
            let callbacks = this.pool.get(command.constructor)
            if (callbacks != null) {
                return Promise.all(callbacks.map((element: any) => {
                    return element(command)
                }))
            } else {
                return Promise.resolve()
            }
        } else {
            let callbacks = this.pool.get(command)
            if (callbacks != null) {
                return Promise.all(callbacks.map((element: any) => {
                    return element(...args)
                }))
            } else {
                return Promise.resolve()
            }
        }
    }
    on<T extends Command>(command: string, callback: (command: string) => Promise<void>): void
    on<T extends Command>(commandType: CommandType<T>, callback: (value: T) => Promise<void>): void
    on(command: any, callback: any) {
        let callbacks = this.pool.get(command)
        if (callbacks == null) {
            callbacks = [];
            this.pool.set(command, callbacks)
        }
        callbacks.push(callback);
    }
    getModel<U extends Model>(modelType: new () => U): U {
        return Model.getControlProxy(Zeromvc.modelPool.getSingle(modelType))
    }
    clear() {
        this.pool.clear()
        Zeromvc.modelPool.reset()
    }

    private initControl() {
        controlList.forEach((element) => {
            let control = new element()
            control.start()
        })
    }
}
/**
 * 视图代码组织容器
 */
export class View {
    protected bindList: { model: Model, target: any, prefix: string, callback: (key: string, value: any) => void }[] = [];
    show() {
        this.bindList.forEach((item) => {
            Model.link(item.model, item.callback)
        })
    }
    hide() {
        this.bindList.forEach((item) => {
            Model.unLink(item.model, item.callback)
        })
    }
    getModel<U extends Model>(modelType: new () => U): U {
        return Model.getViewProxy(Zeromvc.modelPool.getSingle(modelType))
    }
    command(command: Command): void
    command(command: string, ...args: any[]): void
    command(command: any, ...args: any[]) {
        Zeromvc.zeromvc.command(command, ...args).then(() => { }).catch((error) => { console.error(error) })
    }
    bind(model: new () => Model, target: any, prefix?: string): void
    bind(model: Model, target: any, prefix?: string): void
    bind(modelOrType: Model | (new () => Model), target: any, prefix = "") {
        let model: Model
        if (modelOrType instanceof Model) {
            model = modelOrType
        } else {
            model = this.getModel(modelOrType)
        }
        this.bindList.push({
            model: model,
            target: target,
            prefix: prefix,
            callback: (key: string, value: any) => {
                const fn: Function = target[prefix + key]
                if (fn != null && typeof fn == "function") {
                    fn.apply(target, [value])
                }
            }
        })
    }
}
/**
 * 逻辑代码组织容器
 */
export class Control {
    getModel<T extends Model>(modelType: new () => T): T {
        return Model.getControlProxy(Zeromvc.modelPool.getSingle(modelType))
    }
    command(command: Command): void
    command(command: string, ...args: any[]): void
    command(command: any, ...args: any[]) {
        Zeromvc.zeromvc.command(command, ...args).then(() => { }).catch((error) => { console.error(error) })
    }

    on<T extends Command>(command: string, callback: (...args: any[]) => void): void
    on<T extends Command>(commandType: CommandType<T>, callback: (value: T) => void): void
    on(command: any, callback: any) {
        Zeromvc.zeromvc.on(command, callback)
    }
    start() {
    }
}
export class ZeromvcError extends Error {

}
/**
 * 让model支持扩展
 */
export interface IRef {
    _ref: {
        model?: Model
        keys?: string[]
    }
}
export function isRef(value: any): value is IRef {
    return value != null && value["_ref"] != null
}


type MT<T> = T extends (...args: infer P) => any ? P : [T]
export type BindProxy<T> = { [P in keyof T]: (callback: (...value: MT<T[P]>) => void) => BindProxy<T> }
/**
 * 数据代码组织容器
 */
export class Model {
    protected controlProxy: this = this
    protected viewProxy: { [P in Exclude<keyof this, "update">]: this[P] } = new Proxy<any>(this, {
        set: (target: any, key: PropertyKey, value: any, receiver: any): boolean => {
            (target as any)[key] = value
            throw new ZeromvcError("can`t change Model in View")
        },
        get: (target: any, key: PropertyKey) => {
            const value = target[key]
            if (typeof value == "function" && typeof key == "string" && key.slice(0, 3) != "get") {
                throw new ZeromvcError("can`t call Model in View")
            } else {
                return value;
            }
        },
        deleteProperty: (target: any, p: string) => {
            delete target[p]
            throw new ZeromvcError("can`t change Model in View")
        }
    })
    static getControlProxy<T extends Model>(value: T): T {
        return value.controlProxy as T
    }
    static getViewProxy<T extends Model>(value: T): T {
        if (Zeromvc.strict) {
            return value.viewProxy as T
        } else {
            return value.controlProxy as T
        }
    }
    static link(model: Model, value: Function): void {
        if (!model.pool.has(value)) {
            model.pool.add(value)
        }
    }
    static unLink(model: Model, value: Function) {
        if (model.pool.has(value)) {
            model.pool.delete(value)
        }
    }
    static bind<T extends Model>(modelClass: new () => T): BindProxy<T> {
        let targetProxy = {}
        let proxy = new Proxy<any>(targetProxy, {
            get: (target: any, p: string, receiver: any) => {
                return (callback: (value: any) => void) => {
                    targetProxy[p] = callback
                    return proxy
                }
            }
        })
        Model.link(Zeromvc.modelPool.getSingle(modelClass), (value: any, ...args: any) => {
            if (targetProxy[value] != null) {
                targetProxy[value](...args)
            }
        })
        return proxy
    }
    private init() {
        for (const key in this) {
            if (Object.prototype.hasOwnProperty.call(this, key)) {
                const element = this[key];
                if (isRef(element)) {
                    Model.addRef(this, [key], element)
                }
            }
        }
    }
    protected start() {
    }
    protected pool: Set<Function> = new Set()
    static update<T extends Model>(model: T, key: keyof T, ...args: any[]) {
        model.pool.forEach((item) => {
            item(key, ...args)
        })
    }
    static addRef(model: Model, keys: string[], ref: IRef) {
        ref._ref.keys = keys
        ref._ref.model = model
    }
}



/**
 * 数据代码组织容器
 * 定时模型更新
 */
export class TickModel extends Model {
    static initTicker(tickTime = 16) {
        setInterval(() => {
            this.upTicker()
        }, tickTime)
    }
    static upTicker() {
        TickModel.tickList.forEach(element => {
            const keyPool = TickModel.tick(element)
            for (const key in keyPool) {
                const value = keyPool[key];
                element.pool.forEach((item) => {
                    item(key, ...value)
                })
            }
        });
        TickModel.tickList = []
    }
    static tickList: TickModel[] = []
    static pool: Set<Model> = new Set()
    static tick<T extends TickModel>(value: T): any {
        const out = value.updateKeyPool
        value.updateKeyPool = {}
        return out
    }
    protected updateKeyPool: any = {}
    static tickUpdate<T extends TickModel>(model: T, key: keyof T, ...args: any[]): void {
        model.updateKeyPool[key] = args
        TickModel.tickList.push(model)
    }
    constructor() {
        super()
        this.controlProxy = new Proxy<any>(this, {
            set: (target: any, key: PropertyKey, value: any, receiver: any): boolean => {
                if ((target as any)[key] != value) {
                    (target as any)[key] = value
                    if (typeof key == "string" && key.charAt(0) != "_") {
                        this.updateKeyPool[key] = [value]
                        TickModel.tickList.push(target)
                    }
                }
                return true
            },
            get: (target: any, key: PropertyKey, receiver: any) => {
                const value = target[key]
                if (typeof value == "function" && typeof key == "string" && key.charAt(0) != "_" && value != "update") {
                    return (...args: any[]) => {
                        let out = value.apply(receiver, args)
                        this.updateKeyPool[key] = args
                        TickModel.tickList.push(target)
                        return out
                    }
                } else {
                    return value;
                }
            }
        })
    }
}

let controlList: (new () => Control)[] = []
export function addControl() {
    return function (target: (new () => Control)) {
        controlList.push(target)
    }
}

export class VoModel<T> extends TickModel {
    initVo(value: T) {
        Object.assign(this, value)
    }
}
export function createVoModel<T>(): new () => T & VoModel<T> {
    return class extends VoModel<T> {
    } as any
}
