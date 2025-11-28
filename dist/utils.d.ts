export declare class Mutex {
    #private;
    runExclusive<T>(callback: () => Promise<T> | T): Promise<T>;
}
