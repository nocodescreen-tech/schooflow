import React from 'react';
import { useDocumentStore } from '../../hooks/useDocumentStore';
import { DocumentElement } from '../../types/document';

interface RendererProps {
  data?: Record<string, string>;
}

interface ElementStyle {
  fontSize?: number;
  color?: string;
  textAlign?: string;
  fontWeight?: string;
  fontFamily?: string;
  border?: string;
  borderRadius?: number;
  backgroundColor?: string;
  borderWidth?: number;
  borderColor?: string;
}

interface TemplateElement extends DocumentElement {
  style?: ElementStyle;
}

export const DocumentRenderer: React.FC<RendererProps> = ({ data }) => {
  const { template } = useDocumentStore();

  if (!template) return <div className="flex items-center justify-center h-full text-gray-500">Select a template to edit</div>;

  // A4 Aspect Ratio is 1:1.414
  const aspectRatio = template.settings?.orientation === 'landscape' ? 1.414 : 0.707;

  const renderContent = (content: string | undefined): string => {
    if (!content) return '';
    return content.replace(/\{\{(.+?)\}\}/g, (match, path) => data?.[path.trim()] || match);
  };

  return (
    <div className="flex justify-center p-8 bg-gray-200 min-h-screen overflow-auto">
      <div 
        className="bg-white shadow-2xl overflow-hidden"
        style={{
          width: '100%',
          maxWidth: '794px',
          aspectRatio: aspectRatio,
          position: 'relative',
        }}
      >
        {template.elements.map((el: TemplateElement) => (
          <div
            key={el.id}
            style={{
              position: 'absolute',
              top: `${el.y}px`,
              left: `${el.x}px`,
              width: `${el.width}px`,
              height: `${el.height}px`,
              opacity: el.opacity,
              transform: `rotate(${el.rotation || 0}deg)`,
              display: el.visible ? 'block' : 'none',
            }}
          >
            {el.type === 'text' && (
              <div style={{ 
                fontSize: `${el.style?.fontSize || 14}px`, 
                color: el.style?.color || '#000',
                textAlign: (el.style?.textAlign as React.CSSProperties['textAlign']) || 'left',
                fontWeight: el.style?.fontWeight || 'normal'
              }}>
                {renderContent(el.content)}
              </div>
            )}
            {el.type === 'image' && (
              <img src={el.content} alt="element" className="w-full h-full object-contain" />
            )}
            {el.type === 'rectangle' && (
              <div style={{
                border: `${el.style?.borderWidth || 1}px solid ${el.style?.borderColor || '#000'}`,
                borderRadius: `${el.style?.borderRadius || 0}px`,
              }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};