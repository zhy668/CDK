/**
 * 构建脚本：将前端静态文件嵌入到 Worker 中
 */

const fs = require('fs');
const path = require('path');

// 读取文件内容并转换为字符串
function readFileAsString(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error.message);
        return '';
    }
}

// 获取文件的 MIME 类型
function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon'
    };
    return mimeTypes[ext] || 'text/plain';
}

// 前端文件路径
const frontendDir = path.join(__dirname, '../../frontend');
const outputFile = path.join(__dirname, '../src/static-assets.ts');

// 需要嵌入的文件
const staticFiles = {
    '/': path.join(frontendDir, 'index.html'),
    '/index.html': path.join(frontendDir, 'index.html'),
    '/styles/main.css': path.join(frontendDir, 'styles/main.css'),
    '/js/config.js': path.join(frontendDir, 'js/config.js'),
    '/js/utils.js': path.join(frontendDir, 'js/utils.js'),
    '/js/api.js': path.join(frontendDir, 'js/api.js'),
    '/js/auth.js': path.join(frontendDir, 'js/auth.js'),
    '/js/turnstile.js': path.join(frontendDir, 'js/turnstile.js'),
    '/js/app.js': path.join(frontendDir, 'js/app.js')
};

console.log('🔨 开始构建静态资源...');

// 生成静态资源映射
const assets = {};
const mimeTypes = {};

for (const [route, filePath] of Object.entries(staticFiles)) {
    if (fs.existsSync(filePath)) {
        console.log(`📄 处理文件: ${route} -> ${filePath}`);
        
        let content = readFileAsString(filePath);
        
        // 如果是 config.js，更新 API 地址为相对路径
        if (route === '/js/config.js') {
            content = content.replace(
                /API_BASE_URL:\s*['"][^'"]*['"]/,
                "API_BASE_URL: ''"
            );
            console.log('🔧 已更新 config.js 中的 API_BASE_URL 为相对路径');
        }
        
        // 如果是 HTML，更新脚本和样式路径
        if (route.endsWith('.html')) {
            // 确保路径是绝对路径（以 / 开头）
            content = content.replace(/src="js\//g, 'src="/js/');
            content = content.replace(/href="styles\//g, 'href="/styles/');
            console.log('🔧 已更新 HTML 中的资源路径');
        }
        
        assets[route] = content;
        mimeTypes[route] = getMimeType(filePath);
    } else {
        console.warn(`⚠️  文件不存在: ${filePath}`);
    }
}

// 生成 TypeScript 文件
const tsContent = `/**
 * 静态资源文件
 * 自动生成，请勿手动编辑
 */

export interface StaticAsset {
    content: string;
    mimeType: string;
}

export const STATIC_ASSETS: Record<string, StaticAsset> = {
${Object.entries(assets).map(([route, content]) => {
    const escapedContent = JSON.stringify(content);
    const mimeType = mimeTypes[route];
    return `  '${route}': {
    content: ${escapedContent},
    mimeType: '${mimeType}'
  }`;
}).join(',\n')}
};

export function getStaticAsset(path: string): StaticAsset | null {
    // 处理根路径
    if (path === '/' || path === '') {
        return STATIC_ASSETS['/'] || null;
    }
    
    // 直接匹配
    if (STATIC_ASSETS[path]) {
        return STATIC_ASSETS[path];
    }
    
    // 如果路径不以 / 开头，添加 /
    if (!path.startsWith('/')) {
        path = '/' + path;
        if (STATIC_ASSETS[path]) {
            return STATIC_ASSETS[path];
        }
    }
    
    return null;
}
`;

// 写入文件
try {
    fs.writeFileSync(outputFile, tsContent, 'utf8');
    console.log(`✅ 静态资源已生成: ${outputFile}`);
    console.log(`📊 共处理 ${Object.keys(assets).length} 个文件`);
    
    // 显示文件大小统计
    const totalSize = Object.values(assets).reduce((sum, content) => sum + content.length, 0);
    console.log(`📏 总大小: ${(totalSize / 1024).toFixed(2)} KB`);
    
} catch (error) {
    console.error('❌ 生成静态资源文件失败:', error.message);
    process.exit(1);
}

console.log('🎉 构建完成！');
