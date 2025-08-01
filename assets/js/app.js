/**
 * 主应用类 - 精灵图切割工具
 */
class SpriteCutter {
    constructor() {
        this.imageProcessor = new ImageProcessor();
        this.historyManager = new HistoryManager();
        this.draggableGrid = new DraggableGrid();
        this.currentImage = null;
        this.isProcessing = false;
        this.customTileOrder = null; // 存储自定义的图块顺序
        
        this.init();
    }

    /**
     * 初始化应用
     */
    init() {
        this.setupElements();
        this.setupEventListeners();
        this.setupDragDrop();
        this.checkBrowserSupport();
        this.loadSettings();
        this.initializePreviewState(); // 初始化预览状态
        
        Utils.showNotification('精灵图切割工具已就绪', 'success', 2000);
    }

    /**
     * 设置元素引用
     */
    setupElements() {
        this.elements = {
            fileInput: document.getElementById('fileInput'),
            fileNameDisplay: document.getElementById('fileNameDisplay'),
            dropArea: document.getElementById('dropArea'),
            previewBtn: document.getElementById('previewBtn'),
            splitBtn: document.getElementById('splitBtn'),
            resetOrderBtn: document.getElementById('resetOrderBtn'),
            restoreAllBtn: document.getElementById('restoreAllBtn'),
            previewImg: document.getElementById('previewImg'),
            draggableGrid: document.getElementById('draggableGrid'),
            previewPlaceholder: document.getElementById('previewPlaceholder'),
            statusMessage: document.getElementById('statusMessage'),
            
            // 设置元素
            rows: document.getElementById('rows'),
            cols: document.getElementById('cols'),
            startNum: document.getElementById('startNum'),
            fontSize: document.getElementById('fontSize'),
            addNumber: document.getElementById('addNumber'),
            showPreviewNumber: document.getElementById('showPreviewNumber'),
            sortDirectionInputs: document.querySelectorAll('input[name="sortDirection"]'),
            previewModeInputs: document.querySelectorAll('input[name="previewMode"]')
        };
    }

    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        // 文件选择
        this.elements.fileInput.addEventListener('change', (e) => {
            this.handleFileSelect(e.target.files[0]);
        });

        // 预览按钮
        this.elements.previewBtn.addEventListener('click', () => {
            this.generatePreview();
        });

        // 切割按钮
        this.elements.splitBtn.addEventListener('click', () => {
            this.splitImage();
        });

        // 重置顺序按钮
        this.elements.resetOrderBtn.addEventListener('click', () => {
            this.resetTileOrder();
        });

        // 恢复所有图块按钮
        this.elements.restoreAllBtn.addEventListener('click', () => {
            this.restoreAllTiles();
        });

        // 设置变化监听（实时预览）
        const settingsElements = [
            this.elements.rows, this.elements.cols, this.elements.startNum,
            this.elements.fontSize, this.elements.addNumber, this.elements.showPreviewNumber,
            ...this.elements.sortDirectionInputs
        ];

        settingsElements.forEach(element => {
            const eventType = element.type === 'checkbox' || element.type === 'radio' ? 'change' : 'input';
            element.addEventListener(eventType, Utils.debounce(() => {
                if (this.currentImage) {
                    this.generatePreview();
                }
                this.saveSettings();
            }, 500));
        });

        // 预览模式切换监听
        this.elements.previewModeInputs.forEach(radio => {
            radio.addEventListener('change', () => {
                this.updateNumberControlsVisibility();
                if (this.currentImage) {
                    this.generatePreview();
                }
            });
        });

        // 初始化序号控制显示状态
        this.updateNumberControlsVisibility();

        // 监听可拖拽网格的顺序变化
        this.elements.draggableGrid.addEventListener('tileOrderChanged', (e) => {
            this.customTileOrder = e.detail.order;
            this.updateRestoreButtonVisibility();
            Utils.showNotification('图块顺序已更新', 'success', 2000);
        });

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'o':
                        e.preventDefault();
                        this.elements.fileInput.click();
                        break;
                    case 'p':
                        e.preventDefault();
                        this.generatePreview();
                        break;
                    case 's':
                        e.preventDefault();
                        this.splitImage();
                        break;
                }
            }
        });

        // 禁用预览区域的右键菜单，避免与图块右键删除功能冲突
        this.elements.previewImg.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        // 禁用预览容器的右键菜单
        const previewContainer = document.querySelector('.preview-container');
        if (previewContainer) {
            previewContainer.addEventListener('contextmenu', (e) => {
                // 如果右键点击的是图块，则允许图块处理右键事件
                if (e.target.classList.contains('grid-tile')) {
                    return;
                }
                // 其他情况阻止右键菜单
                e.preventDefault();
            });
        }
    }

    /**
     * 设置拖拽上传
     */
    setupDragDrop() {
        const dropArea = this.elements.dropArea;
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, this.preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropArea.addEventListener(eventName, () => {
                dropArea.classList.add('drag-over');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, () => {
                dropArea.classList.remove('drag-over');
            }, false);
        });

        dropArea.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileSelect(files[0]);
            }
        }, false);
    }

    /**
     * 阻止默认事件
     */
    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    /**
     * 检查浏览器支持
     */
    checkBrowserSupport() {
        const support = Utils.checkBrowserSupport();
        const unsupported = Object.entries(support)
            .filter(([key, value]) => !value)
            .map(([key]) => key);

        if (unsupported.length > 0) {
            Utils.showNotification(
                `您的浏览器不支持以下功能: ${unsupported.join(', ')}`,
                'warning',
                5000
            );
        }
    }

    /**
     * 处理文件选择
     */
    async handleFileSelect(file) {
        if (!file) {
            this.resetFileDisplay();
            return;
        }

        if (!Utils.isValidImageFile(file)) {
            Utils.showNotification('请选择有效的图片文件（PNG、JPEG、GIF、WebP）', 'error');
            this.resetFileDisplay();
            return;
        }

        try {
            this.updateStatus('正在加载图片...');
            this.elements.fileNameDisplay.textContent = `${file.name} (${Utils.formatFileSize(file.size)})`;
            
            this.currentImage = await Utils.loadImage(file);
            
            // 显示图片信息
            const info = this.imageProcessor.getImageInfo(this.currentImage);
            Utils.showNotification(
                `图片已加载: ${info.width}x${info.height}`,
                'success'
            );

            // 自动生成预览
            await this.generatePreview();
            
        } catch (error) {
            console.error('图片加载失败:', error);
            Utils.showNotification('图片加载失败，请重试', 'error');
            this.resetFileDisplay();
        }
    }

    /**
     * 重置文件显示
     */
    resetFileDisplay() {
        this.currentImage = null;
        this.elements.fileNameDisplay.textContent = '或将文件拖拽到此处';
        this.elements.previewImg.style.display = 'none';
        this.elements.previewPlaceholder.style.display = 'block';
        this.updateStatus('请选择图片文件');
    }

    /**
     * 生成预览
     */
    async generatePreview() {
        if (!this.currentImage) {
            Utils.showNotification('请先选择图片文件', 'warning');
            return;
        }

        if (this.isProcessing) return;

        try {
            this.isProcessing = true;
            this.updateStatus('正在生成预览...');
            
            const settings = this.getSettings();
            const previewMode = document.querySelector('input[name="previewMode"]:checked').value;
            
            if (previewMode === 'grid') {
                // 显示可拖拽网格
                this.elements.previewImg.style.display = 'none';
                this.elements.draggableGrid.classList.add('active');
                this.elements.draggableGrid.style.removeProperty('display'); // 移除内联样式让CSS类生效
                this.elements.previewPlaceholder.style.display = 'none';
                
                // 可拖拽网格模式下，序号始终显示，不受addNumber影响
                const gridSettings = { ...settings, addNumber: true };
                this.draggableGrid.init(this.elements.draggableGrid, this.currentImage, gridSettings);
                this.updateRestoreButtonVisibility();
            } else {
                // 显示传统图像预览
                this.elements.draggableGrid.classList.remove('active');
                this.elements.draggableGrid.style.display = 'none'; // 强制隐藏
                this.elements.previewPlaceholder.style.display = 'none';
                
                // 图像预览模式下，使用showPreviewNumber控制序号显示
                const showPreviewNumber = this.elements.showPreviewNumber && this.elements.showPreviewNumber.checked;
                const previewSettings = { ...settings, addNumber: showPreviewNumber };
                const previewDataUrl = this.imageProcessor.generatePreview(this.currentImage, previewSettings);
                this.elements.previewImg.src = previewDataUrl;
                this.elements.previewImg.style.display = 'block';
                
                // 确保图像加载完成后再显示
                this.elements.previewImg.onload = () => {
                    console.log('图像预览已加载，显示状态:', this.elements.previewImg.style.display);
                };
                
                console.log('切换到图像预览模式，showPreviewNumber:', showPreviewNumber);
            }
            
            this.updateStatus('预览已生成');
            
        } catch (error) {
            console.error('预览生成失败:', error);
            Utils.showNotification('预览生成失败', 'error');
            this.updateStatus('预览生成失败');
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * 根据预览模式更新序号控制的显示状态
     */
    updateNumberControlsVisibility() {
        const previewMode = document.querySelector('input[name="previewMode"]:checked').value;
        const imageControl = document.getElementById('imagePreviewNumberControl');
        const gridControl = document.getElementById('gridPreviewNumberControl');
        
        if (previewMode === 'grid') {
            // 可拖拽网格模式 - 显示网格序号控制，隐藏图像序号控制
            if (gridControl) gridControl.style.display = 'block';
            if (imageControl) imageControl.style.display = 'none';
        } else {
            // 图像预览模式 - 显示图像序号控制，隐藏网格序号控制
            if (imageControl) imageControl.style.display = 'block';
            if (gridControl) gridControl.style.display = 'none';
        }
    }

    /**
     * 初始化预览状态
     */
    initializePreviewState() {
        // 确保拖拽网格初始状态是隐藏的
        this.elements.draggableGrid.classList.remove('active');
        // 确保预览图片初始状态是隐藏的
        this.elements.previewImg.style.display = 'none';
        // 显示占位符
        this.elements.previewPlaceholder.style.display = 'block';
    }

    /**
     * 切割图片
     */
    async splitImage() {
        if (!this.currentImage) {
            Utils.showNotification('请先选择图片文件', 'warning');
            return;
        }

        if (this.isProcessing) {
            Utils.showNotification('正在处理中，请稍候...', 'warning');
            return;
        }

        try {
            this.isProcessing = true;
            this.elements.splitBtn.disabled = true;
            this.updateStatus('正在切割图片，请稍候...');

            const settings = this.getSettings();
            
            // 如果有自定义顺序，添加到设置中
            if (this.customTileOrder) {
                settings.customOrder = this.customTileOrder;
            }
            
            const zipBlob = await this.imageProcessor.splitImage(this.currentImage, settings);
            
            // 生成文件名
            const timestamp = Utils.formatDateTime().replace(/[:\s]/g, '_');
            const filename = `精灵图切割_${timestamp}.zip`;
            
            // 下载文件
            Utils.downloadFile(zipBlob, filename);
            
            // 保存到历史
            await this.historyManager.save(filename, zipBlob, settings);
            
            this.updateStatus('切割完成！');
            Utils.showNotification('切割完成，文件已下载', 'success');
            
        } catch (error) {
            console.error('图片切割失败:', error);
            Utils.showNotification('图片切割失败，请重试', 'error');
            this.updateStatus('切割失败');
        } finally {
            this.isProcessing = false;
            this.elements.splitBtn.disabled = false;
        }
    }

    /**
     * 获取当前设置
     */
    getSettings() {
        const sortDirection = document.querySelector('input[name="sortDirection"]:checked')?.value || CONFIG.DEFAULTS.SORT_DIRECTION;
        
        return {
            rows: Math.max(CONFIG.LIMITS.MIN_ROWS, Math.min(parseInt(this.elements.rows.value) || CONFIG.DEFAULTS.ROWS, CONFIG.LIMITS.MAX_ROWS)),
            cols: Math.max(CONFIG.LIMITS.MIN_COLS, Math.min(parseInt(this.elements.cols.value) || CONFIG.DEFAULTS.COLS, CONFIG.LIMITS.MAX_COLS)),
            startNum: Math.max(0, parseInt(this.elements.startNum.value) || CONFIG.DEFAULTS.START_NUM),
            fontSize: Math.max(CONFIG.LIMITS.MIN_FONT_SIZE, Math.min(parseInt(this.elements.fontSize.value) || CONFIG.DEFAULTS.FONT_SIZE, CONFIG.LIMITS.MAX_FONT_SIZE)),
            addNumber: this.elements.addNumber.checked,
            showPreviewNumber: this.elements.showPreviewNumber.checked,
            sortDirection
        };
    }

    /**
     * 保存设置到本地存储
     */
    saveSettings() {
        try {
            const settings = this.getSettings();
            localStorage.setItem(CONFIG.STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
        } catch (error) {
            console.error('保存设置失败:', error);
        }
    }

    /**
     * 从本地存储加载设置
     */
    loadSettings() {
        try {
            const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.SETTINGS);
            if (!saved) return;

            const settings = JSON.parse(saved);
            
            this.elements.rows.value = settings.rows || CONFIG.DEFAULTS.ROWS;
            this.elements.cols.value = settings.cols || CONFIG.DEFAULTS.COLS;
            this.elements.startNum.value = settings.startNum || CONFIG.DEFAULTS.START_NUM;
            this.elements.fontSize.value = settings.fontSize || CONFIG.DEFAULTS.FONT_SIZE;
            this.elements.addNumber.checked = settings.addNumber !== undefined ? settings.addNumber : false; // 默认不添加序号到最终图片
            this.elements.showPreviewNumber.checked = settings.showPreviewNumber !== undefined ? settings.showPreviewNumber : true; // 默认在预览中显示序号
            
            // 设置排序方向
            const sortRadio = document.querySelector(`input[name="sortDirection"][value="${settings.sortDirection || CONFIG.DEFAULTS.SORT_DIRECTION}"]`);
            if (sortRadio) {
                sortRadio.checked = true;
            }
            
        } catch (error) {
            console.error('加载设置失败:', error);
        }
    }

    /**
     * 更新状态显示
     */
    updateStatus(message) {
        if (this.elements.statusMessage) {
            this.elements.statusMessage.textContent = message;
        }
    }

    /**
     * 重置图块顺序
     */
    resetTileOrder() {
        if (this.draggableGrid && this.elements.draggableGrid.style.display !== 'none') {
            this.draggableGrid.resetOrder();
            this.customTileOrder = null;
            this.updateRestoreButtonVisibility();
            Utils.showNotification('图块顺序已重置', 'success', 2000);
        } else {
            Utils.showNotification('请先切换到可拖拽网格模式', 'warning', 3000);
        }
    }

    /**
     * 恢复所有图块
     */
    restoreAllTiles() {
        if (this.draggableGrid && this.elements.draggableGrid.style.display !== 'none') {
            this.draggableGrid.resetDeletions();
            this.updateRestoreButtonVisibility();
        } else {
            Utils.showNotification('请先切换到可拖拽网格模式', 'warning', 3000);
        }
    }

    /**
     * 更新恢复按钮的显示状态
     */
    updateRestoreButtonVisibility() {
        if (!this.draggableGrid || !this.elements.restoreAllBtn) return;
        
        // 检查是否有已删除的图块
        const hasDeletedTiles = this.draggableGrid.tiles && this.draggableGrid.tiles.some(tile => 
            tile.dataset.deleted === 'true'
        );
        
        // 显示或隐藏恢复按钮
        this.elements.restoreAllBtn.style.display = hasDeletedTiles ? 'inline-block' : 'none';
    }

    /**
     * 重置应用状态
     */
    reset() {
        this.resetFileDisplay();
        this.isProcessing = false;
        this.elements.splitBtn.disabled = false;
        this.imageProcessor.dispose();
    }

    /**
     * 销毁应用
     */
    destroy() {
        this.reset();
        this.imageProcessor = null;
        this.historyManager = null;
        this.currentImage = null;
    }
}

// 当DOM加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
    // 检查必要的依赖
    if (typeof JSZip === 'undefined') {
        alert('JSZip库未加载，请检查网络连接或CDN可用性');
        return;
    }

    // 初始化应用
    window.spriteCutter = new SpriteCutter();
    
    // 全局错误处理
    window.addEventListener('error', (e) => {
        console.error('应用错误:', e.error);
        Utils.showNotification('应用发生错误，请刷新页面重试', 'error');
    });
    
    // 未处理的Promise错误
    window.addEventListener('unhandledrejection', (e) => {
        console.error('未处理的Promise错误:', e.reason);
        Utils.showNotification('操作失败，请重试', 'error');
    });
});

// 导出主应用类
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SpriteCutter;
}
