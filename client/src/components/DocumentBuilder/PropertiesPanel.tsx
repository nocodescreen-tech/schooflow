import React from 'react';
import { Trash2 } from 'lucide-react';

interface PropertiesPanelProps {
  selectedElementId: string | null;
  template: {
    elements: Array<{
      id: string;
      content?: string;
      x?: number;
      y?: number;
      opacity?: number;
    }>;
  };
  updateElement: (id: string, updates: Partial<{ content: string; x: number; y: number; opacity: number }>) => void;
  deleteElement: (id: string) => void;
}

export const PropertiesPanel = ({
  selectedElementId,
  template,
  updateElement,
  deleteElement,
}: PropertiesPanelProps) => {
  if (!selectedElementId) {
    return (
      <div className="space-y-6">
        <p className="text-gray-500 text-center py-10">
          Select an element to edit properties
        </p>
      </div>
    );
  }

  const selectedElement = template.elements.find((e) => e.id === selectedElementId);

  if (!selectedElement) {
    return (
      <div className="space-y-6">
        <p className="text-gray-500 text-center py-10">
          Element not found
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700">Content</label>
        <textarea
          className="w-full border rounded-md p-2 mt-1 text-sm min-h-[80px]"
          value={selectedElement.content || ''}
          onChange={(e) => {
            updateElement(selectedElementId, { content: e.target.value });
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">X Position</label>
          <input
            type="number"
            className="w-full border rounded-md p-2 mt-1 text-sm"
            value={selectedElement.x || 0}
            onChange={(e) => {
              updateElement(selectedElementId, { x: parseInt(e.target.value) || 0 });
            }}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Y Position</label>
          <input
            type="number"
            className="w-full border rounded-md p-2 mt-1 text-sm"
            value={selectedElement.y || 0}
            onChange={(e) => {
              updateElement(selectedElementId, { y: parseInt(e.target.value) || 0 });
            }}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Opacity</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          className="w-full mt-2"
          value={selectedElement.opacity || 1}
          onChange={(e) => {
            updateElement(selectedElementId, { opacity: parseFloat(e.target.value) });
          }}
        />
      </div>

      <button
        onClick={() => deleteElement(selectedElementId)}
        className="w-full bg-red-50 text-red-600 py-2 rounded-md flex items-center justify-center gap-2 hover:bg-red-100 transition"
      >
        <Trash2 size={16} /> Delete Element
      </button>
    </div>
  );
};