export interface UserInfo {
  id: string;
  name: string;
  username: string;
  email?: string;
  image?: string;
}

export interface RmhConfig {
  token: string;
  user: UserInfo;
}

export interface BuildItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  visibility: string;
  technologies: string[];
  likeCount: number;
  viewCount: number;
  createdAt: string;
  publishedAt: string | null;
}

export interface ApiError {
  error: string;
}
