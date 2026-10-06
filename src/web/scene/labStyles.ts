import type { LabType } from './layout';

/** How a kind of lab looks: floor, trim and label colours, and its display name. */
export interface LabStyle {
  name: string;
  floor: string;
  trim: string;
  accent: string;
}

/** One distinct, bright look per lab type. */
export const LAB_STYLES: Record<LabType, LabStyle> = {
  chemistry: { name: 'Chemistry lab', floor: '#e7b37a', trim: '#ff8a3d', accent: '#ff5fa2' },
  biology: { name: 'Biology lab', floor: '#bfe0a4', trim: '#2fbf71', accent: '#3ddc84' },
  physics: { name: 'Physics lab', floor: '#bcd3f2', trim: '#2f8cff', accent: '#7fd1ff' },
  computer: { name: 'Computer lab', floor: '#d3cdeb', trim: '#8a5cd6', accent: '#b69bff' },
  robotics: { name: 'Robotics lab', floor: '#efd9a6', trim: '#f2b705', accent: '#ffd23f' },
};
