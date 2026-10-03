import { create } from 'zustand';
import { DocumentTemplate, DocumentElement, ElementType } from '../types/document';

interface DocumentState {
  template: DocumentTemplate | null;
  selectedElementId: string | null;
  setTemplate: (template: DocumentTemplate) => void;
  selectElement: (id: string | null) => void;
  updateElement: (id: string, updates: Partial<DocumentElement>) => void;
  addElement: (type: ElementType) => void;
  deleteElement: (id: string) => void;
  moveElement: (id: string, x: number, y: number) => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  template: null,
  selectedElementId: null,

  setTemplate: (template) => set({ template }),

  selectElement: (id) => set({ selectedElementId: id }),

  updateElement: (id, updates) =>
    set((state) => {
      if (!state.template) return state;
      return {
        template: {
          ...state.template,
          elements: state.template.elements.map((el) =>
            el.id === id ? { ...el, ...updates } : el
          ),
        },
      };
    }),

  addElement: (type: ElementType) =>
    set((state) => {
      if (!state.template) return state;
      const newElement: DocumentElement = {
        id: crypto.randomUUID(),
        type,
        x: 100,
        y: 100,
        width: 200,
        height: 50,
        rotation: 0,
        opacity: 1,
        visible: true,
        content: 'New Element',
        style: { fontSize: 16, color: '#000000' },
      };
      return {
        template: {
          ...state.template,
          elements: [...state.template.elements, newElement],
        },
      };
    }),

  deleteElement: (id) =>
    set((state) => {
      if (!state.template) return state;
      return {
        template: {
          ...state.template,
          elements: state.template.elements.filter((el) => el.id !== id),
        },
        selectedElementId: state.selectedElementId === id ? null : state.selectedElementId,
      };
    }),

  moveElement: (id, x, y) =>
    set((state) => {
      if (!state.template) return state;
      return {
        template: {
          ...state.template,
          elements: state.template.elements.map((el) =>
            el.id === id ? { ...el, x, y } : el
          ),
        },
      };
    }),
}));