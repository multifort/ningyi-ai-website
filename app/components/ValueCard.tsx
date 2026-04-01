import { FC } from "react";

export interface ValueCardProps {
  icon: string;
  title: string;
  value: string;
  description: string;
}

export const ValueCard: FC<ValueCardProps> = ({ icon, title, value, description }) => {
  return (
    <div className="flex flex-col items-center bg-white rounded-xl shadow-lg p-6 w-full">
      <div className="text-4xl mb-4 text-accent1">{icon}</div>
      <div className="text-2xl font-semibold text-primary">{value}</div>
      <div className="mt-2 text-sm text-textGray text-center">{description}</div>
    </div>
  );
};