// GENX AI Studio API Integration
// Integrates OpenRouter and Pollinations.ai for multimodal generation

// Type definitions for AI generation
export interface GenerationRequest {
  id: string;
  type: 'text' | 'image' | 'video' | 'audio';
  prompt: string;
  model: string;
  parameters: Record<string, any>;
  emotion?: string;
  intensity?: number;
  style?: string;
  duration?: number;
}

export interface GenerationResponse {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: any;
  error?: string;
  progress?: number;
  metadata: {
    model: string;
    parameters: Record<string, any>;
    processingTime?: number;
    tokensUsed?: number;
  };
}

export interface Scene {
  id: string;
  title: string;
  description: string;
  emotion: string;
  intensity: number;
  duration: number;
  style: string;
  camera: string;
  generatedAssets: {
    text?: string;
    image?: string;
    video?: string;
    audio?: string;
  };
}

export interface Project {
  id: string;
  name: string;
  scenes: Scene[];
  settings: {
    resolution: string;
    framerate: number;
    voice: string;
    lipSync: boolean;
    fluxRender: boolean;
    seedance: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

// AI Model Configuration based on the document
const AI_MODELS = {
  text: {
    'horizon-alpha': { endpoint: 'openrouter', model: 'anthropic/claude-3-haiku' },
    'z-ai-glm': { endpoint: 'openrouter', model: 'zhipuai/glm-4' },
    'qwen3-coder': { endpoint: 'openrouter', model: 'qwen/qwen-coder-plus' },
    'google-gemini': { endpoint: 'openrouter', model: 'google/gemini-pro' },
    'deepseek-r1t2': { endpoint: 'openrouter', model: 'deepseek/deepseek-chat' }
  },
  image: {
    'svd-xt': { endpoint: 'pollinations', model: 'flux' },
    'pollinations-diffusion': { endpoint: 'pollinations', model: 'flux-realism' },
    'text2video-fusion': { endpoint: 'pollinations', model: 'flux-anime' }
  },
  audio: {
    'pollinations-audio': { endpoint: 'pollinations', model: 'audiogen' },
    'tts-emotion-v2': { endpoint: 'pollinations', model: 'tts' },
    'musiclm': { endpoint: 'pollinations', model: 'music' },
    'whisper-tts': { endpoint: 'pollinations', model: 'voice' }
  },
  video: {
    'flux-engine': { endpoint: 'pollinations', model: 'video' },
    'seedance-dsl': { endpoint: 'pollinations', model: 'motion' },
    'lens-warp': { endpoint: 'pollinations', model: 'cinematic' }
  }
};

// OpenRouter API Integration
class OpenRouterAPI {
  private apiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateText(prompt: string, model: string, parameters: any = {}): Promise<any> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://genx-ai-studio.vercel.app',
        'X-Title': 'GENX AI Studio'
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        ...parameters
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    return await response.json();
  }

  async getAvailableModels(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/models`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    return await response.json();
  }
}

// Pollinations.ai API Integration
class PollinationsAPI {
  private baseUrl = 'https://text.pollinations.ai';
  private imageUrl = 'https://image.pollinations.ai';
  private videoUrl = 'https://video.pollinations.ai';
  private audioUrl = 'https://audio.pollinations.ai';

  async generateImage(prompt: string, parameters: any = {}): Promise<any> {
    const urlParams = new URLSearchParams({
      prompt: prompt,
      model: parameters.model || 'flux',
      width: parameters.width || '1024',
      height: parameters.height || '1024',
      seed: parameters.seed || '-1',
      enhance: parameters.enhance || 'true',
      safe: 'true'
    });

    const imageUrl = `${this.imageUrl}/prompt/${encodeURIComponent(prompt)}?${urlParams.toString()}`;
    
    return {
      url: imageUrl,
      prompt: prompt,
      parameters: parameters
    };
  }

  async generateVideo(prompt: string, parameters: any = {}): Promise<any> {
    const urlParams = new URLSearchParams({
      prompt: prompt,
      model: parameters.model || 'video',
      width: parameters.width || '1024',
      height: parameters.height || '1024',
      duration: parameters.duration || '3'
    });

    const videoUrl = `${this.videoUrl}/prompt/${encodeURIComponent(prompt)}?${urlParams.toString()}`;
    
    return {
      url: videoUrl,
      prompt: prompt,
      parameters: parameters
    };
  }

  async generateAudio(prompt: string, parameters: any = {}): Promise<any> {
    const urlParams = new URLSearchParams({
      prompt: prompt,
      model: parameters.model || 'audiogen',
      duration: parameters.duration || '10'
    });

    const audioUrl = `${this.audioUrl}/prompt/${encodeURIComponent(prompt)}?${urlParams.toString()}`;
    
    return {
      url: audioUrl,
      prompt: prompt,
      parameters: parameters
    };
  }
}

// Scene Processing with Emotion Integration
class SceneProcessor {
  private openRouter: OpenRouterAPI;
  private pollinations: PollinationsAPI;

  constructor(openRouterKey: string) {
    this.openRouter = new OpenRouterAPI(openRouterKey);
    this.pollinations = new PollinationsAPI();
  }

  async processScene(scene: Scene): Promise<Scene> {
    const emotionPrompt = this.buildEmotionPrompt(scene);
    
    try {
      // Generate enhanced description using OpenRouter
      const textGeneration = await this.openRouter.generateText(
        `Enhance this scene description with emotional context: ${scene.description}. Emotion: ${scene.emotion} at ${scene.intensity}% intensity. Style: ${scene.style}. Camera: ${scene.camera}.`,
        'anthropic/claude-3-haiku',
        { max_tokens: 150, temperature: 0.7 }
      );

      const enhancedDescription = textGeneration.choices[0].message.content;

      // Generate visual content using Pollinations
      const imageGeneration = await this.pollinations.generateImage(
        `${enhancedDescription}, ${emotionPrompt}, ${scene.style} style, ${scene.camera} shot`,
        { 
          model: 'flux-realism',
          width: '1920',
          height: '1080',
          enhance: 'true'
        }
      );

      // Generate video if duration > 0
      let videoGeneration: any = null;
      if (scene.duration > 0) {
        videoGeneration = await this.pollinations.generateVideo(
          `${enhancedDescription}, ${emotionPrompt}, cinematic movement`,
          {
            model: 'video',
            duration: scene.duration.toString(),
            width: '1920',
            height: '1080'
          }
        );
      }

      // Generate audio narration
      const audioGeneration = await this.pollinations.generateAudio(
        `Emotional ${scene.emotion} background music for: ${enhancedDescription}`,
        {
          model: 'music',
          duration: scene.duration.toString()
        }
      );

      return {
        ...scene,
        description: enhancedDescription,
        generatedAssets: {
          text: enhancedDescription,
          image: imageGeneration.url,
          video: videoGeneration?.url,
          audio: audioGeneration.url
        }
      };
    } catch (error) {
      console.error('Scene processing error:', error);
      throw error;
    }
  }

  private buildEmotionPrompt(scene: Scene): string {
    const emotionMap: Record<string, string> = {
      joy: 'bright, uplifting, warm colors, smiling expressions',
      sadness: 'muted colors, downward expressions, melancholic atmosphere',
      anger: 'intense reds, aggressive postures, dynamic tension',
      fear: 'dark shadows, wide eyes, tense body language',
      surprise: 'bright lighting, open expressions, dynamic composition',
      disgust: 'sickly greens, negative expressions, uncomfortable atmosphere',
      neutral: 'balanced composition, natural lighting, calm expressions',
      love: 'warm pinks, gentle expressions, soft lighting',
      excitement: 'vibrant colors, energetic movement, dynamic angles'
    };

    const baseEmotion = emotionMap[scene.emotion] || emotionMap.neutral;
    const intensity = scene.intensity / 100;
    
    return `${baseEmotion}, intensity level ${intensity}, emotional depth`;
  }
}

// Main API Export Functions
export const genxAPI = {
  // Initialize APIs
  init(openRouterKey: string) {
    return new SceneProcessor(openRouterKey);
  },

  // Generate multimodal content for a scene
  async generateScene(scene: Scene, openRouterKey: string): Promise<Scene> {
    const processor = new SceneProcessor(openRouterKey);
    return await processor.processScene(scene);
  },

  // Generate content by type
  async generateContent(request: GenerationRequest, apiKeys: { openRouter?: string }): Promise<GenerationResponse> {
    const startTime = Date.now();
    
    try {
      let result: any;
      
      switch (request.type) {
        case 'text':
          if (!apiKeys.openRouter) throw new Error('OpenRouter API key required for text generation');
          const openRouter = new OpenRouterAPI(apiKeys.openRouter);
          result = await openRouter.generateText(request.prompt, request.model, request.parameters);
          break;
          
        case 'image':
          const pollinations = new PollinationsAPI();
          result = await pollinations.generateImage(request.prompt, request.parameters);
          break;
          
        case 'video':
          const pollinationsVideo = new PollinationsAPI();
          result = await pollinationsVideo.generateVideo(request.prompt, request.parameters);
          break;
          
        case 'audio':
          const pollinationsAudio = new PollinationsAPI();
          result = await pollinationsAudio.generateAudio(request.prompt, request.parameters);
          break;
          
        default:
          throw new Error(`Unsupported generation type: ${request.type}`);
      }
      
      return {
        id: request.id,
        status: 'completed',
        result,
        metadata: {
          model: request.model,
          parameters: request.parameters,
          processingTime: Date.now() - startTime
        }
      };
    } catch (error) {
      return {
        id: request.id,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          model: request.model,
          parameters: request.parameters,
          processingTime: Date.now() - startTime
        }
      };
    }
  },

  // Get available models
  getAvailableModels() {
    return AI_MODELS;
  },

  // Process multiple scenes in batch
  async batchProcessScenes(scenes: Scene[], openRouterKey: string): Promise<Scene[]> {
    const processor = new SceneProcessor(openRouterKey);
    const results = await Promise.allSettled(
      scenes.map(scene => processor.processScene(scene))
    );
    
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        console.error(`Scene ${scenes[index].id} processing failed:`, result.reason);
        return scenes[index]; // Return original scene if processing failed
      }
    });
  },

  // Fusion pipeline: OpenRouter → Pollinations → Flux Engine
  async fusionPipeline(project: Project, apiKeys: { openRouter?: string }): Promise<Project> {
    if (!apiKeys.openRouter) {
      throw new Error('OpenRouter API key required for fusion pipeline');
    }
    
    const processedScenes = await this.batchProcessScenes(project.scenes, apiKeys.openRouter);
    
    return {
      ...project,
      scenes: processedScenes,
      updatedAt: new Date().toISOString()
    };
  }
}; 