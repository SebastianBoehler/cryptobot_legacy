import { EntryOrderObject, ExitOrderObject } from "./trading";

interface StorageItem {
  trades: (EntryOrderObject | ExitOrderObject)[];
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
