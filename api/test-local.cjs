// api/test-local.cjs - Version avec worker local
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Configuration Supabase
const supabase = createClient(
    'https://cpdokjsyxmohubgvxift.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwZG9ranN5eG1vaHViZ3Z4aWZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2MzI1MzQsImV4cCI6MjA2ODIwODUzNH0.R_E0t1WLWby-ZeqohAL8HUumto5uYPTJacnqij-JVaM'
);

async function testPDF() {
    try {
        console.log('🚀 Test extraction PDF...');
        
        // Charger pdfjs-dist
        console.log('📚 Chargement de pdfjs-dist...');
        const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
        
        // ============================================
        // UTILISER LE WORKER LOCAL
        // ============================================
        // Ne pas utiliser de CDN, utiliser le worker local
        // pdfjsLib.GlobalWorkerOptions.workerSrc = ''; // Vide = utilisation du fallback
        
        // OU utiliser un chemin local
        const workerPath = path.join(__dirname, '../node_modules/pdfjs-dist/legacy/build/pdf.worker.js');
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;
        console.log(`📚 Worker local: ${workerPath}`);

        // Lister les fichiers disponibles
        console.log('📁 Récupération de la liste des CVs...');
        const { data: files, error: listError } = await supabase.storage
            .from('truthtalent')
            .list('cvs');

        if (listError) {
            console.error('❌ Erreur liste:', listError);
            return;
        }

        if (!files || files.length === 0) {
            console.log('❌ Aucun fichier trouvé dans cvs/');
            return;
        }

        console.log(`📁 ${files.length} fichiers trouvés`);

        // Filtrer pour ne garder que les PDF
        const pdfFiles = files.filter(function(file) {
            return file.name.toLowerCase().endsWith('.pdf');
        });

        console.log(`📄 ${pdfFiles.length} fichiers PDF trouvés`);

        if (pdfFiles.length === 0) {
            console.log('❌ Aucun fichier PDF trouvé');
            console.log('📄 Fichiers disponibles:', files.map(f => f.name).join(', '));
            return;
        }

        const firstFile = pdfFiles[0];
        console.log(`📄 Premier PDF: ${firstFile.name}`);

        // Télécharger le premier fichier PDF
        const { data: fileData, error: downloadError } = await supabase.storage
            .from('truthtalent')
            .download(`cvs/${firstFile.name}`);

        if (downloadError) {
            console.error('❌ Erreur téléchargement:', downloadError);
            return;
        }

        console.log(`✅ Fichier téléchargé, taille: ${fileData.size} octets`);

        const arrayBuffer = await fileData.arrayBuffer();
        console.log('📖 Lecture du PDF...');
        
        const loadingTask = pdfjsLib.getDocument({ 
            data: new Uint8Array(arrayBuffer),
            useSystemFonts: true,
            // Désactiver le worker si nécessaire
            disableWorker: true
        });
        
        const pdf = await loadingTask.promise;
        console.log(`✅ PDF chargé, ${pdf.numPages} pages`);

        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items.map(function(item) { 
                return item.str; 
            }).join(' ');
            fullText += pageText + '\n\n';
            console.log(`📄 Page ${i}: ${pageText.length} caractères`);
        }

        console.log('📝 Texte extrait (premiers caractères):');
        console.log(fullText.substring(0, 800));
        console.log('...');
        
        // Extraction des données importantes
        const emailMatch = fullText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const phoneMatch = fullText.match(/(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/);
        
        console.log('📧 Email trouvé:', emailMatch ? emailMatch[0] : 'Aucun');
        console.log('📱 Téléphone trouvé:', phoneMatch ? phoneMatch[0] : 'Aucun');
        
    } catch (error) {
        console.error('❌ Erreur:', error.message);
        if (error.stack) console.error(error.stack);
    }
}

testPDF();