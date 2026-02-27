export default function SecretLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="fixed inset-0 bg-[#0a0a0f]">
            <div className="h-full overflow-y-auto">
                {children}
            </div>
        </div>
    );
}
