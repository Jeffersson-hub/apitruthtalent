import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const formats = [
    {
      format: 'pdf',
      icon: '📄',
      description: 'Document Adobe Acrobat',
      mime_types: ['application/pdf'],
      extensions: ['.pdf'],
      features: ['Texte extraction directe']
    },
    {
      format: 'docx',
      icon: '📝',
      description: 'Document Microsoft Word (moderne)',
      mime_types: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      extensions: ['.docx'],
      features: ['Texte structuré', 'Métadonnées']
    },
    {
      format: 'doc',
      icon: '📝',
      description: 'Document Microsoft Word (ancien)',
      mime_types: ['application/msword'],
      extensions: ['.doc'],
      features: ['Texte extraction']
    },
    {
      format: 'png',
      icon: '🖼️',
      description: 'Image Portable Network Graphics',
      mime_types: ['image/png'],
      extensions: ['.png'],
      features: ['OCR', 'Haute qualité']
    },
    {
      format: 'jpg',
      icon: '🖼️',
      description: 'Image JPEG',
      mime_types: ['image/jpeg', 'image/jpg'],
      extensions: ['.jpg', '.jpeg'],
      features: ['OCR', 'Compression']
    }
  ];
  
  res.status(200).json({
    ok: true,
    data: formats,
    count: formats.length
  });
}