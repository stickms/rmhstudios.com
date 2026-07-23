import os
import re

directories_to_process = [
    "/Users/mahmoud/Dev/rmhstudios.com/components/feed/",
    "/Users/mahmoud/Dev/rmhstudios.com/components/errors/",
    "/Users/mahmoud/Dev/rmhstudios.com/components/blog/"
]

replacements = {
    r'\bglass-(inset|fill|pane|chrome|overlay)\b(?!-)': 'bg-site-surface border border-site-border rounded-2xl shadow-xs',
    r'\bbackdrop-blur-[a-z0-9-]+\b': '',
    r'\bbackdrop-filter\b': '',
    r'\bbg-site-glass-tint\b': 'bg-site-surface',
    r'\bborder-site-border/70\b': 'border-site-border',
    r'\bborder-transparent\b': 'border-site-border',
    r'\bshadow-inner\b': 'shadow-xs',
    r'\bhover:border-site-border-bright\b': 'hover:border-site-text/40',
    r'\bfocus-visible:ring-site-accent/(40|50)\b': 'focus-visible:ring-site-accent',
    r'\bfocus-visible:bg-site-glass-tint\b': 'focus-visible:bg-site-surface',
    r'\bbg-site-surface/60\b': 'bg-site-surface',
    r'\bbg-site-glass(-[^ \'\"]+)?\b': 'bg-site-surface', # handle bg-site-glass-rim, bg-site-glass etc? Wait, the prompt says "Replace bg-site-glass-tint with bg-site-surface".
    r'\bglass-liquid\b': 'bg-site-surface border border-site-border rounded-2xl shadow-xs', # to handle liquid
    r'\bglass-interactive\b': '', # maybe remove this? It adds interactive stuff, but maybe I should just let it be if not specified. Wait, prompt doesn't specify glass-interactive.
}

# The prompt specifically asked to replace:
# - glass-inset, glass-fill, glass-pane, glass-chrome, glass-overlay
# - backdrop-blur-*, backdrop-filter
# - bg-site-glass-tint -> bg-site-surface
# - border-site-border/70 or transparent borders -> border-site-border
# - shadow-inner -> shadow-xs
# - hover:border-site-border-bright -> hover:border-site-text/40
# - focus-visible:ring-site-accent/40 or /50 -> focus-visible:ring-site-accent
# - focus-visible:bg-site-glass-tint -> focus-visible:bg-site-surface
# - bg-site-surface/60 -> bg-site-surface

def clean_classes(text):
    for pattern, replacement in replacements.items():
        if 'glass-interactive' in pattern or 'glass-liquid' in pattern or 'bg-site-glass(-' in pattern:
            continue # Skip ones not explicitly requested unless they are related to glass-tint
        text = re.sub(pattern, replacement, text)
    
    # Let's fix up some overlaps manually
    text = re.sub(r'\bglass-(inset|fill|pane|chrome|overlay)\b(?!-)', 'bg-site-surface border border-site-border rounded-2xl shadow-xs', text)
    text = re.sub(r'\bbackdrop-blur-[a-z0-9-]+\b', '', text)
    text = re.sub(r'\bbackdrop-filter\b', '', text)
    text = re.sub(r'\bbg-site-glass-tint\b', 'bg-site-surface', text)
    text = re.sub(r'\bborder-site-border/70\b', 'border-site-border', text)
    text = re.sub(r'\bborder-transparent\b', 'border-site-border', text)
    text = re.sub(r'\bshadow-inner\b', 'shadow-xs', text)
    text = re.sub(r'\bhover:border-site-border-bright\b', 'hover:border-site-text/40', text)
    text = re.sub(r'\bfocus-visible:ring-site-accent/(40|50)\b', 'focus-visible:ring-site-accent', text)
    text = re.sub(r'\bfocus-visible:bg-site-glass-tint\b', 'focus-visible:bg-site-surface', text)
    text = re.sub(r'\bbg-site-surface/60\b', 'bg-site-surface', text)
    
    # Clean up double spaces
    text = re.sub(r' +', ' ', text)
    text = text.replace(' "', '"').replace('" ', '"').replace(" '", "'").replace("' ", "'").replace('` ', '`')
    return text

for directory in directories_to_process:
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(('.tsx', '.ts', '.jsx', '.js')):
                full_path = os.path.join(root, file)
                with open(full_path, 'r') as f:
                    content = f.read()
                
                new_content = clean_classes(content)
                
                if new_content != content:
                    with open(full_path, 'w') as f:
                        f.write(new_content)
                    print(f"Updated {full_path}")

print("Updates completed.")
