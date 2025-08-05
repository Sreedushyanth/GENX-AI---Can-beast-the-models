// IndexedDB implementation for offline-first storage
import Dexie, { Table } from 'dexie';

// Database schema interfaces
export interface Project {
  id: string;
  name: string;
  description?: string;
  scenes: Scene[];
  settings: ProjectSettings;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error';
  version: number;
}

export interface Scene {
  id: string;
  projectId: string;
  title: string;
  description: string;
  emotion: string;
  intensity: number;
  duration: number;
  style: string;
  camera: string;
  order: number;
  generatedAssets: GeneratedAssets;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedAssets {
  text?: GeneratedAsset;
  image?: GeneratedAsset;
  video?: GeneratedAsset;
  audio?: GeneratedAsset;
}

export interface GeneratedAsset {
  id: string;
  type: 'text' | 'image' | 'video' | 'audio';
  url?: string;
  data?: Blob;
  prompt: string;
  model: string;
  parameters: Record<string, any>;
  status: 'generating' | 'completed' | 'failed';
  progress?: number;
  error?: string;
  createdAt: string;
  fileSize?: number;
  duration?: number;
  projectId?: string;
  sceneId?: string;
}

export interface ProjectSettings {
  resolution: string;
  framerate: number;
  voice: string;
  lipSync: boolean;
  fluxRender: boolean;
  seedance: boolean;
  quality: 'low' | 'medium' | 'high' | 'ultra';
  outputFormat: 'mp4' | 'webm' | 'mov' | 'gif';
}

export interface SyncQueueItem {
  id: string;
  type: 'create' | 'update' | 'delete';
  entityType: 'project' | 'scene' | 'asset';
  entityId: string;
  data?: any;
  timestamp: string;
  retryCount: number;
  lastError?: string;
}

export interface UserTemplate {
  id: string;
  name: string;
  description: string;
  author: string;
  type: 'scene' | 'project' | 'style' | 'character';
  data: any;
  tags: string[];
  downloads: number;
  rating: number;
  isPublic: boolean;
  createdAt: string;
}

export interface Analytics {
  id: string;
  eventType: string;
  entityId?: string;
  entityType?: string;
  data: Record<string, any>;
  timestamp: string;
  sessionId: string;
  userId?: string;
}

export interface CacheEntry {
  id: string;
  key: string;
  data: any;
  expiresAt: string;
  accessCount: number;
  lastAccessed: string;
}

// Main Dexie database class
export class GenXDatabase extends Dexie {
  projects!: Table<Project>;
  scenes!: Table<Scene>;
  assets!: Table<GeneratedAsset>;
  syncQueue!: Table<SyncQueueItem>;
  templates!: Table<UserTemplate>;
  analytics!: Table<Analytics>;
  cache!: Table<CacheEntry>;

  constructor() {
    super('GenXAIStudio');
    
    this.version(1).stores({
      projects: 'id, name, updatedAt, syncStatus, version',
      scenes: 'id, projectId, title, updatedAt, order',
      assets: 'id, type, status, createdAt, projectId, sceneId',
      syncQueue: 'id, type, entityType, entityId, timestamp, retryCount',
      templates: 'id, name, author, type, downloads, rating, isPublic, createdAt',
      analytics: 'id, eventType, entityType, timestamp, sessionId, userId',
      cache: 'id, key, expiresAt, accessCount, lastAccessed'
    });

    // Hooks for automatic timestamp updates
    this.projects.hook('creating', (primKey, obj, trans) => {
      obj.createdAt = new Date().toISOString();
      obj.updatedAt = new Date().toISOString();
      obj.syncStatus = 'pending';
      obj.version = 1;
    });

    this.projects.hook('updating', (modifications: any, primKey, obj: any, trans) => {
      modifications.updatedAt = new Date().toISOString();
      modifications.syncStatus = 'pending';
      modifications.version = (obj.version || 0) + 1;
    });

    this.scenes.hook('creating', (primKey, obj, trans) => {
      obj.createdAt = new Date().toISOString();
      obj.updatedAt = new Date().toISOString();
    });

    this.scenes.hook('updating', (modifications: any, primKey, obj, trans) => {
      modifications.updatedAt = new Date().toISOString();
    });

    this.assets.hook('creating', (primKey, obj, trans) => {
      obj.createdAt = new Date().toISOString();
    });
  }
}

// Database instance
export const db = new GenXDatabase();

// Database operations class
export class DatabaseOperations {
  // Project operations
  static async createProject(projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'version'>): Promise<Project> {
    const id = `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const project: Project = {
      id,
      ...projectData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
      version: 1
    };

    await db.projects.add(project);
    await this.addToSyncQueue('create', 'project', id, project);
    await this.trackAnalytics('project_created', id, 'project', { name: project.name });
    
    return project;
  }

  static async getProject(id: string): Promise<Project | undefined> {
    const project = await db.projects.get(id);
    if (project) {
      await this.trackAnalytics('project_viewed', id, 'project', {});
    }
    return project;
  }

  static async updateProject(id: string, updates: Partial<Project>): Promise<void> {
    await db.projects.update(id, updates);
    await this.addToSyncQueue('update', 'project', id, updates);
    await this.trackAnalytics('project_updated', id, 'project', updates);
  }

  static async deleteProject(id: string): Promise<void> {
    // Delete related scenes and assets
    const scenes = await db.scenes.where('projectId').equals(id).toArray();
    for (const scene of scenes) {
      await this.deleteScene(scene.id);
    }
    
    await db.projects.delete(id);
    await this.addToSyncQueue('delete', 'project', id);
    await this.trackAnalytics('project_deleted', id, 'project', {});
  }

  static async getAllProjects(): Promise<Project[]> {
    return await db.projects.orderBy('updatedAt').reverse().toArray();
  }

  static async searchProjects(query: string): Promise<Project[]> {
    return await db.projects
      .filter(project => 
        project.name.toLowerCase().includes(query.toLowerCase()) ||
        (project.description?.toLowerCase().includes(query.toLowerCase()) ?? false)
      )
      .toArray();
  }

  // Scene operations
  static async createScene(sceneData: Omit<Scene, 'id' | 'createdAt' | 'updatedAt'>): Promise<Scene> {
    const id = `scene_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const scene: Scene = {
      id,
      ...sceneData,
      generatedAssets: sceneData.generatedAssets || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await db.scenes.add(scene);
    await this.addToSyncQueue('create', 'scene', id, scene);
    await this.trackAnalytics('scene_created', id, 'scene', { projectId: scene.projectId });
    
    return scene;
  }

  static async getScene(id: string): Promise<Scene | undefined> {
    return await db.scenes.get(id);
  }

  static async updateScene(id: string, updates: Partial<Scene>): Promise<void> {
    await db.scenes.update(id, updates);
    await this.addToSyncQueue('update', 'scene', id, updates);
    await this.trackAnalytics('scene_updated', id, 'scene', updates);
  }

  static async deleteScene(id: string): Promise<void> {
    // Delete related assets
    const assets = await db.assets.where('sceneId').equals(id).toArray();
    for (const asset of assets) {
      await this.deleteAsset(asset.id);
    }
    
    await db.scenes.delete(id);
    await this.addToSyncQueue('delete', 'scene', id);
    await this.trackAnalytics('scene_deleted', id, 'scene', {});
  }

  static async getProjectScenes(projectId: string): Promise<Scene[]> {
    return await db.scenes.where('projectId').equals(projectId).sortBy('order');
  }

  static async reorderScenes(projectId: string, sceneOrders: { id: string; order: number }[]): Promise<void> {
    for (const { id, order } of sceneOrders) {
      await db.scenes.update(id, { order });
    }
    await this.trackAnalytics('scenes_reordered', projectId, 'project', { sceneCount: sceneOrders.length });
  }

  // Asset operations
  static async saveAsset(assetData: Omit<GeneratedAsset, 'id' | 'createdAt'>): Promise<GeneratedAsset> {
    const id = `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const asset: GeneratedAsset = {
      id,
      ...assetData,
      createdAt: new Date().toISOString()
    };

    await db.assets.add(asset);
    await this.addToSyncQueue('create', 'asset', id, asset);
    await this.trackAnalytics('asset_generated', id, 'asset', { type: asset.type, model: asset.model });
    
    return asset;
  }

  static async getAsset(id: string): Promise<GeneratedAsset | undefined> {
    return await db.assets.get(id);
  }

  static async updateAsset(id: string, updates: Partial<GeneratedAsset>): Promise<void> {
    await db.assets.update(id, updates);
    await this.addToSyncQueue('update', 'asset', id, updates);
  }

  static async deleteAsset(id: string): Promise<void> {
    await db.assets.delete(id);
    await this.addToSyncQueue('delete', 'asset', id);
  }

  static async getAssetsByType(type: GeneratedAsset['type']): Promise<GeneratedAsset[]> {
    return await db.assets.where('type').equals(type).toArray();
  }

  static async getAssetsByScene(sceneId: string): Promise<GeneratedAsset[]> {
    return await db.assets.where('sceneId').equals(sceneId).toArray();
  }

  // Sync operations
  static async addToSyncQueue(type: SyncQueueItem['type'], entityType: SyncQueueItem['entityType'], entityId: string, data?: any): Promise<void> {
    const id = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const syncItem: SyncQueueItem = {
      id,
      type,
      entityType,
      entityId,
      data,
      timestamp: new Date().toISOString(),
      retryCount: 0
    };

    await db.syncQueue.add(syncItem);
  }

  static async getSyncQueue(): Promise<SyncQueueItem[]> {
    return await db.syncQueue.orderBy('timestamp').toArray();
  }

  static async removeSyncItem(id: string): Promise<void> {
    await db.syncQueue.delete(id);
  }

  static async incrementSyncRetry(id: string, error: string): Promise<void> {
    const item = await db.syncQueue.get(id);
    if (item) {
      await db.syncQueue.update(id, {
        retryCount: item.retryCount + 1,
        lastError: error
      });
    }
  }

  // Analytics operations
  static async trackAnalytics(eventType: string, entityId?: string, entityType?: string, data: Record<string, any> = {}): Promise<void> {
    const id = `analytics_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const sessionId = this.getSessionId();
    
    const analyticsEntry: Analytics = {
      id,
      eventType,
      entityId,
      entityType,
      data,
      timestamp: new Date().toISOString(),
      sessionId
    };

    await db.analytics.add(analyticsEntry);
  }

  static async getAnalytics(startDate?: string, endDate?: string): Promise<Analytics[]> {
    let query = db.analytics.orderBy('timestamp');
    
    if (startDate && endDate) {
      query = query.filter(entry => 
        entry.timestamp >= startDate && entry.timestamp <= endDate
      );
    }
    
    return await query.toArray();
  }

  // Cache operations
  static async setCache(key: string, data: any, ttlMinutes: number = 60): Promise<void> {
    const id = `cache_${key.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
    
    const cacheEntry: CacheEntry = {
      id,
      key,
      data,
      expiresAt,
      accessCount: 0,
      lastAccessed: new Date().toISOString()
    };

    await db.cache.put(cacheEntry);
  }

  static async getCache<T>(key: string): Promise<T | null> {
    const id = `cache_${key.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const entry = await db.cache.get(id);
    
    if (!entry) return null;
    
    // Check if expired
    if (new Date(entry.expiresAt) < new Date()) {
      await db.cache.delete(id);
      return null;
    }
    
    // Update access stats
    await db.cache.update(id, {
      accessCount: entry.accessCount + 1,
      lastAccessed: new Date().toISOString()
    });
    
    return entry.data as T;
  }

  static async clearExpiredCache(): Promise<void> {
    const now = new Date().toISOString();
    await db.cache.where('expiresAt').below(now).delete();
  }

  // Utility functions
  static getSessionId(): string {
    let sessionId = sessionStorage.getItem('genx_session_id');
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('genx_session_id', sessionId);
    }
    return sessionId;
  }

  // Database maintenance
  static async cleanupDatabase(): Promise<void> {
    // Clear expired cache
    await this.clearExpiredCache();
    
    // Remove old analytics (keep last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.analytics.where('timestamp').below(thirtyDaysAgo).delete();
    
    // Remove failed sync items after 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await db.syncQueue
      .where('timestamp').below(sevenDaysAgo)
      .and(item => item.retryCount > 5)
      .delete();
  }

  // Export/Import functions
  static async exportProject(projectId: string): Promise<any> {
    const project = await this.getProject(projectId);
    if (!project) throw new Error('Project not found');
    
    const scenes = await this.getProjectScenes(projectId);
    const assets = await Promise.all(
      scenes.map(scene => this.getAssetsByScene(scene.id))
    );
    
    return {
      project,
      scenes,
      assets: assets.flat(),
      exportDate: new Date().toISOString(),
      version: '1.0'
    };
  }

  static async importProject(projectData: any): Promise<Project> {
    const { project, scenes, assets } = projectData;
    
    // Create new project with new ID
    const newProject = await this.createProject({
      name: `${project.name} (Imported)`,
      description: project.description,
      scenes: [],
      settings: project.settings
    });
    
    // Import scenes
    const sceneIdMap = new Map();
    for (const scene of scenes) {
      const newScene = await this.createScene({
        ...scene,
        projectId: newProject.id
      });
      sceneIdMap.set(scene.id, newScene.id);
    }
    
    // Import assets
    for (const asset of assets) {
      const newSceneId = sceneIdMap.get(asset.sceneId);
      if (newSceneId) {
        await this.saveAsset({
          ...asset,
          sceneId: newSceneId,
          projectId: newProject.id
        });
      }
    }
    
    await this.trackAnalytics('project_imported', newProject.id, 'project', {
      originalProjectId: project.id,
      sceneCount: scenes.length,
      assetCount: assets.length
    });
    
    return newProject;
  }
}

// Initialize database and cleanup
db.open().then(() => {
  console.log('GenX AI Studio Database initialized');
  
  // Run cleanup every hour
  setInterval(() => {
    DatabaseOperations.cleanupDatabase().catch(console.error);
  }, 60 * 60 * 1000);
});

export default DatabaseOperations;