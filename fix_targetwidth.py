import os
import re

routes_dir = '/Users/mahmoud/Dev/rmhstudios.com/app/routes'

for root, _, files in os.walk(routes_dir):
    for file in files:
        if file.endswith('.tsx'):
            path = os.path.join(root, file)
            with open(path, 'r') as f:
                content = f.read()
            
            orig = content
            
            # Remove targetWidth={...}
            content = re.sub(r'\s*targetWidth=\{[^}]+\}', '', content)
            
            if content != orig:
                with open(path, 'w') as f:
                    f.write(content)
                print(f"Updated {path}")
