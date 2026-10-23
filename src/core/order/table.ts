export interface AreaDoc {
  _id: string; // area:<branchId>:<slug>
  branchId: string;
  name: string; // e.g. "Tầng 1", "Sân vườn"
  sortOrder: number;
  createdAt: string;
}

export interface TableDoc {
  _id: string; // table:<branchId>:<slug>
  branchId: string;
  areaId: string;
  code: string; // e.g. "B01", "T02"
  name: string; // e.g. "Bàn 1"
  capacity: number;
  shape?: 'round' | 'square' | 'rectangle';
  sortOrder: number;
  createdAt: string;
}

export type TableStatus = 'empty' | 'occupied' | 'bill_printed';
