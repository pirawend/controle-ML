// esbuild.config.js
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const outdir = 'dist'; // Pasta onde os arquivos de build (resultado final) serão gerados

// Cria o diretório de saída 'dist' se ele não existir
if (!fs.existsSync(outdir)){
    fs.mkdirSync(outdir, { recursive: true });
}

esbuild.build({
    entryPoints: ['index.tsx'], // Seu arquivo de entrada principal TypeScript/React
    bundle: true,               // Agrupa todos os arquivos JS necessários em um só
    outfile: path.join(outdir, 'bundle.js'), // Arquivo JavaScript de saída (ex: dist/bundle.js)
    minify: true,               // Minifica o código (remove espaços, etc.) para produção
    sourcemap: true,            // Gera sourcemaps para ajudar no debug em produção
    target: ['es2020'],        // Define a compatibilidade com navegadores modernos
    jsx: 'automatic',           // Habilita o novo JSX transform do React (não precisa importar React em todo arquivo)
    loader: { '.tsx': 'tsx', '.ts': 'ts' }, // Define como carregar arquivos .ts e .tsx
    // Externaliza dependências que são carregadas via CDN no seu index.html (do import map)
    // Isso evita que o esbuild tente incluir o React, etc., no seu bundle.js, pois eles já vêm de fora.
    external: ['react', 'react-dom/', 'react/', 'lucide-react', 'recharts'],
    define: {
        'process.env.NODE_ENV': '"production"',
        // Esta linha é crucial. Ela permite que você defina BACKEND_URL através das variáveis de ambiente do Netlify.
        // Se REACT_APP_BACKEND_URL não estiver definida no ambiente de build, usará 'http://localhost:3001' como fallback.
        'process.env.REACT_APP_BACKEND_URL': JSON.stringify(process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001')
    },
}).then(() => {
    console.log('Build do JavaScript concluído.');

    // Lê o conteúdo do index.html original
    let htmlContent = fs.readFileSync('index.html', 'utf-8');
    
    // Substitui a referência ao index.tsx (desenvolvimento) pelo bundle.js (produção)
    // É importante que o <script> no index.html original seja exatamente <script type="module" src="/index.tsx"></script>
    htmlContent = htmlContent.replace(
        '<script type="module" src="/index.tsx"></script>',
        '<script type="module" src="/bundle.js"></script>'
    );
    
    // Salva o index.html modificado na pasta de saída (dist)
    fs.writeFileSync(path.join(outdir, 'index.html'), htmlContent);
    console.log('index.html processado e copiado para dist/.');

    // Copia o arquivo _redirects para a pasta dist, se ele existir na raiz do projeto
    if (fs.existsSync('_redirects')) {
        fs.copyFileSync('_redirects', path.join(outdir, '_redirects'));
        console.log('_redirects copiado para dist/.');
    } else {
        console.warn('Arquivo _redirects não encontrado na raiz do projeto. Se esta é uma SPA, você pode precisar criá-lo.');
    }
    
    console.log('Build completo com sucesso! A pasta "dist" está pronta para deploy.');
}).catch((e) => {
    console.error('Falha no build:', e);
    process.exit(1);
});