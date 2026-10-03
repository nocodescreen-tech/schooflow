export type ElementType = 'text' | 'rich-text' | 'image' | 'table' | 'line' | 'rectangle' | 'circle' | 'signature' | 'stamp' | 'qr-code' | 'barcode';

export interface DocumentElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  content?: string;
  data?: any; // For tables or dynamic fields
  style?: {
    fontSize?: number;
    color?: string;
    textAlign?: string;
    fontWeight?: string;
    fontFamily?: string;
    border?: string;
    borderRadius?: number;
    backgroundColor?: string;
  };
}

export interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  category: 'academic' | 'administrative' | 'financial' | 'internal';
  status: 'draft' | 'active' | 'archived';
  elements: DocumentElement[];
  settings: {
    pageSize: 'A4' | 'A5' | 'A6' | 'Letter';
    orientation: 'portrait' | 'landscape';
    margins: {
      top: number;
      bottom: number;
      left: number;
      right: number;
    };
  };
  updatedAt: string;
  updatedBy: string;
}
