/**
 * 项目元数据
 */
export interface ProjectMeta {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  /** 是否启用「速查」浮层（每项目开关，缺省视为 true） */
  referenceEnabled?: boolean;
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
  referenceEnabled?: boolean;
}
