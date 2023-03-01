import { orderObject } from "./trading";

interface StorageItem {
  trades: orderObject[];
  indexes: {
    long_entry: 0;
    long_exit: 0;
    short_entry: 0;
    short_exit: 0;
  };
}

export interface Storage {
  [key: string]: StorageItem;
}
