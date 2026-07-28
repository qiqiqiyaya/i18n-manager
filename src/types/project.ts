/**
 * 项目元数据
 */
export interface ProjectMeta {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 项目管理操作输入
 */
export interface ProjectCreateInput {
  title: string;
  description?: string;
}

export interface ProjectUpdateInput {
  title?: string;
  description?: string;
}
