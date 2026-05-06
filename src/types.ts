export const categories = [
  'Kamera',
  'Audio',
  'Licht',
  'Grip & Stative',
  'Computer und Pulte',
  'Signaltechnik & Wandlung',
  'Akkus',
  'Kabel',
  'Speicher & Medien',
  'Zubehör',
  'Werkzeug & Verbrauchsmaterial',
  'Cases & Taschen',
] as const;

export const statuses = [
  'verfügbar',
  'verliehen',
  'in Reparatur',
  'ausgemustert',
] as const;

export type Category = (typeof categories)[number];
export type EquipmentStatus = (typeof statuses)[number];

export type EquipmentItem = {
  id: number;
  workspace_id: string;
  name: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  ean_code: string | null;
  category: Category;
  purchase_date: string | null;
  purchase_price: number | null;
  status: EquipmentStatus;
  borrower: string | null;
  borrowed_at: string | null;
  return_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
};

export type EquipmentFormData = Omit<
  EquipmentItem,
  'id' | 'workspace_id' | 'created_at' | 'updated_at'
>;
