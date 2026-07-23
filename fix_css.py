import os
import re

files = [
    "/Users/mahmoud/Dev/rmhstudios.com/components/builds/builds.css",
    "/Users/mahmoud/Dev/rmhstudios.com/components/creator-studio/storefront.css",
    "/Users/mahmoud/Dev/rmhstudios.com/components/ui/dialog.css",
]

for filepath in files:
    try:
        with open(filepath, 'r') as f:
            content = f.read()

        original_content = content
        
        # Remove backdrop-blur and backdrop-filter (correct order!)
        content = re.sub(r'-webkit-backdrop-filter:[^;]+;', '', content)
        content = re.sub(r'backdrop-filter:[^;]+;', '', content)
        content = re.sub(r'\bbackdrop-blur(?:-\w+|-\[[^\]]+\])?\b', '', content)
        content = re.sub(r'\bbackdrop-filter\b', '', content)
        
        # CSS specific replacements
        content = content.replace('var(--glass-tint)', 'var(--site-surface)')
        content = content.replace('var(--glass-noise)', 'none')
        
        # Clean up empty lines where properties were removed in CSS
        content = re.sub(r'\n\s*\n', '\n\n', content)

        if content != original_content:
            with open(filepath, 'w') as f:
                f.write(content)
            print(f"Updated: {filepath}")
    except Exception as e:
        print(f"Error processing {filepath}: {e}")
