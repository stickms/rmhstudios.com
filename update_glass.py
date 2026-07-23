import os
import re

files_to_process = [
    "components/feed/FeedColumn.tsx",
    "components/feed/DailyWheel.tsx",
    "components/feed/ImageCropModal.tsx",
    "components/feed/PostImageGrid.tsx",
    "components/feed/ProfileEditModal.tsx",
    "components/feed/MentionTextarea.tsx",
    "components/feed/ComposeBox.tsx",
    "components/feed/SensitiveMedia.tsx",
    "components/feed/AIImageButton.tsx",
    "components/feed/RMHarkCard.tsx",
    "components/feed/StatusBadge.tsx",
    "components/feed/ComposeModal.tsx",
    "components/feed/RMHarkContent.tsx",
    "components/feed/MobileSidebarShell.tsx",
    "components/feed/RightSidebar.tsx",
    "components/feed/MusicGuessColumn.tsx",
    "components/feed/ComposeBoxLazy.tsx",
    "components/feed/HandleInput.tsx",
    "components/feed/StatusEditor.tsx",
    "components/feed/MentionToast.tsx",
    "components/feed/UserAvatar.tsx",
    "components/errors/RouteErrorFallback.tsx",
    "components/blog/ShareButton.tsx"
]

base_dir = "/Users/mahmoud/Dev/rmhstudios.com"

replacements = {
    r'\bglass-(inset|fill|pane|chrome|overlay)\b(?!-)': 'bg-site-surface border border-site-border rounded-2xl shadow-xs',
    r'\bbackdrop-blur-[a-z0-9-]+\b': '',
    r'\bbackdrop-filter\b': '',
    r'\bbg-site-glass-tint\b': 'bg-site-surface',
    r'\bborder-site-border/70\b': 'border-site-border',
    r'\bshadow-inner\b': 'shadow-xs',
    r'\bhover:border-site-border-bright\b': 'hover:border-site-text/40',
    r'\bfocus-visible:ring-site-accent/(40|50)\b': 'focus-visible:ring-site-accent',
    r'\bfocus-visible:bg-site-glass-tint\b': 'focus-visible:bg-site-surface',
    r'\bbg-site-surface/60\b': 'bg-site-surface',
    r'\bbg-site-glass(-[^ \'\"]+)?\b': 'bg-site-surface' # handle things like bg-site-glass if not tint
}

def clean_classes(text):
    for pattern, replacement in replacements.items():
        if 'glass-chrome' in pattern:
            # We don't want to replace glass-chrome--aside which has a suffix, wait the regex has (?!-) so it won't replace glass-chrome--aside
            pass
        text = re.sub(pattern, replacement, text)
    
    # clean up multiple spaces
    text = re.sub(r' +', ' ', text)
    text = text.replace(' "', '"').replace('" ', '"').replace(' \'', '\'').replace('` ', '`')
    return text

for rel_path in files_to_process:
    full_path = os.path.join(base_dir, rel_path)
    with open(full_path, 'r') as f:
        content = f.read()
    
    new_content = clean_classes(content)
    
    with open(full_path, 'w') as f:
        f.write(new_content)

print("Updates completed.")
