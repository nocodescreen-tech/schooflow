import { DocumentTemplate } from '../../types'; 

export const INITIAL_TEMPLATES: DocumentTemplate[] = [
  {
    id: 'classic-bullet',
    name: 'Bulletin de notes — Classique',
    description: 'Standard report card for students',
    category: 'academic',
    status: 'active',
    elements: [
      {
        id: 'e1',
        type: 'text',
        x: 200, y: 50, width: 400, height: 30,
        rotation: 0, opacity: 1, visible: true,
        content: 'REPUBLIQUE DÉMOCRATIQUE DU CONGO',
        style: { fontSize: 18, fontWeight: 'bold', textAlign: 'center' }
      },
      {
        id: 'e2',
        type: 'text',
        x: 200, y: 80, width: 400, height: 30,
        rotation: 0, opacity: 1, visible: true,
        content: 'MINISTERE DE L\'EDUCATION NATIONALE',
        style: { fontSize: 14, textAlign: 'center' }
      }
    ],
    settings: {
      pageSize: 'A4',
      orientation: 'portrait',
      margins: { top: 50, bottom: 50, left: 50, right: 50 }
    },
    updatedAt: new Date().toISOString(),
    updatedBy: 'system'
  }
  // ... more templates will be added here
];
