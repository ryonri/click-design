// バックグラウンドサービスワーカー

// インストール時の処理 - コンテキストメニューを作成
chrome.runtime.onInstalled.addListener(() => {
  console.log('Thumbnail Creator installed');

  // 右クリックメニューを作成
  chrome.contextMenus.create({
    id: 'generateDesignFromPage',
    title: 'ページ全体からデザインを作成',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'generateDesignFromSelection',
    title: '選択部分からデザインを作成',
    contexts: ['selection']
  });
});

// 拡張機能アイコンがクリックされたときの処理
chrome.action.onClicked.addListener(async (tab) => {
  // 新しいタブでindex.htmlを開く（ページ内容なし）
  await chrome.tabs.create({
    url: chrome.runtime.getURL('index.html')
  });
});

// コンテキストメニューがクリックされたときの処理
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'generateDesignFromPage') {
    handleContextMenuClick(tab, false);
  } else if (info.menuItemId === 'generateDesignFromSelection') {
    handleContextMenuClick(tab, true, info.selectionText);
  }
});

/**
 * コンテキストメニューがクリックされたときの処理
 */
async function handleContextMenuClick(tab, isSelection, selectionText) {
  try {
    let contentToSave;

    if (isSelection) {
      // 選択部分のテキストを使用
      contentToSave = selectionText;
    } else {
      // ページの全文を取得
      const [response] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractPageContent
      });

      const pageContent = response.result;
      contentToSave = pageContent.fullText;
    }

    // ストレージに保存
    await chrome.storage.local.set({
      pendingPageContent: contentToSave
    });

    // 新しいタブでindex.htmlを開く
    await chrome.tabs.create({
      url: chrome.runtime.getURL('index.html')
    });

  } catch (error) {
    console.error('Error:', error);

    // エラー通知
    await chrome.notifications.create({
      type: 'basic',
      title: 'エラー',
      message: `処理に失敗しました: ${error.message}`,
      priority: 2
    });
  }
}

/**
 * ページのメインコンテンツを抽出（バックグラウンドから実行される関数）
 */
function extractPageContent() {
  const title = document.title;
  const metaDescription = document.querySelector('meta[name="description"]')?.content || '';
  const bodyClone = document.body.cloneNode(true);

  const unwantedElements = bodyClone.querySelectorAll('script, style, noscript, iframe, nav, footer, header');
  unwantedElements.forEach(el => el.remove());

  const bodyText = bodyClone.innerText || bodyClone.textContent || '';
  const cleanedText = bodyText.replace(/\s+/g, ' ').trim();

  return {
    title,
    description: metaDescription,
    content: cleanedText.substring(0, 3000), // 要約用（最初の3000文字）
    fullText: cleanedText, // 全文（文字数制限なし）
    url: window.location.href
  };
}

/**
 * サムネイル生成処理（メイン関数）
 */
async function handleThumbnailGeneration(pageContent) {
  try {
    // 1. テキストを要約・分析
    const analysis = await analyzeContent(pageContent);

    // 2. プロンプトを生成
    const prompt = generateImagePrompt(analysis);

    // 3. AI画像生成（プレースホルダー）
    const thumbnailUrl = await generateThumbnailImage(prompt);

    return {
      success: true,
      thumbnailUrl,
      prompt,
      analysis
    };
  } catch (error) {
    console.error('Thumbnail generation error:', error);
    throw error;
  }
}

/**
 * コンテンツを分析してキーワードを抽出
 */
async function analyzeContent(pageContent) {
  // TODO: ここでLLMを使ってコンテンツを分析
  // 現在はシンプルな実装

  const { title, description, content } = pageContent;

  // キーワード抽出（簡易版）
  const words = content.toLowerCase().match(/\b\w+\b/g) || [];
  const wordFreq = {};

  words.forEach(word => {
    if (word.length > 4) { // 4文字以上の単語のみ
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
  });

  const topKeywords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  return {
    title,
    description,
    keywords: topKeywords,
    contentLength: content.length
  };
}

/**
 * 画像生成用のプロンプトを生成
 */
function generateImagePrompt(analysis) {
  // TODO: より洗練されたプロンプト生成ロジック
  const { title, keywords } = analysis;

  return `Create a professional thumbnail image for: "${title}".
Keywords: ${keywords.join(', ')}.
Style: modern, clean, eye-catching, suitable for social media.`;
}

/**
 * AI画像生成（プレースホルダー）
 */
async function generateThumbnailImage(prompt) {
  // TODO: ここで実際の画像生成APIを呼び出す
  // 例: OpenAI DALL-E, Stability AI, Midjourney API など

  console.log('Generating image with prompt:', prompt);

  // プレースホルダー: 現時点ではダミー画像を返す
  await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒待機（API呼び出しをシミュレート）

  // プレースホルダー画像URL
  return 'https://via.placeholder.com/1200x630/4A90E2/ffffff?text=AI+Generated+Thumbnail';
}
