import React from 'react';
import { useDocumentStore } from '../../hooks/useDocumentStore';
import { Text, Image, Square, Type, Plus, Trash2, Download } from 'lucide-react';
import { ElementType } from '../../types/document';

export const Toolbar = () => {
  const { addElement } = useDocumentStore();

  const tools: { id: ElementType; icon: React.ReactNode; label: string }[] = [
    { id: 'text', icon: <Text size={18} />, label: 'Text' },
    { id: 'rich-text', icon: <Type size={18} />, label: 'Rich Text' },
    { id: 'image', icon: <Image size={18} />, label: 'Image' },
    { id: 'rectangle', icon: <Square size={18} />, label: 'Shape' },
  ];

  return (
    <div className="flex items-center gap-2 p-2 bg-white border-b border-gray-200 sticky top-0 z-10">
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => addElement(tool.id)}
          className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 rounded-md transition-colors text-sm font-medium"
        >
          {tool.icon}
          <span>{tool.label}</span>
        </button>
      ))}
      <div className="w-px h-6 bg-gray-200 mx-2" />
      <button className="flex items-center gap-2 px-3 py-1.5 hover:bg-blue-50 text-blue-600 rounded-md text-sm font-medium">
        <Download size={18} />
        <span>Export PDF</span>
      </button>
    </div>
  );
};