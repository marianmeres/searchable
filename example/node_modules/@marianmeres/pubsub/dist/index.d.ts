export declare const createPubSub: () => {
    publish: (event: string, detail: any) => void;
    subscribe: (event: string, cb: CallableFunction) => () => any;
    subscribeOnce: (event: string, cb: CallableFunction) => () => any;
    unsubscribe: (event: string, cb: CallableFunction) => void;
    unsubscribeAll: (event: string) => boolean;
};
