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
            
            # Replace targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH} with nothing (which defaults to DEFAULT_WIDTH)
            # or just change it to targetWidth={DEFAULT_WIDTH}
            content = re.sub(r'targetWidth=\{WIDE_NO_RIGHT_SIDEBAR_WIDTH\}', r'targetWidth={DEFAULT_WIDTH}', content)
            
            # Replace WIDE_WIDTH with DEFAULT_WIDTH
            content = re.sub(r'targetWidth=\{WIDE_WIDTH\}', r'targetWidth={DEFAULT_WIDTH}', content)
            
            # Replace the small 4px/16px spacers with a ContextRail
            # E.g. <div className="hidden lg:block w-4 shrink-0" /> -> <ContextRail reserve />
            content = re.sub(r'<div className="hidden lg:block w-4 shrink-0" ?/>', r'<ContextRail reserve />', content)
            content = re.sub(r'<div className="hidden xl:block w-4 shrink-0" ?/>', r'<ContextRail reserve />', content)
            
            # If ContextRail was added but not imported, import it
            if '<ContextRail' in content and 'ContextRail' not in orig:
                # Add import after AnimatedMain
                content = re.sub(r'(import \{ AnimatedMain \} from [^\n;]+;)', r'\1\nimport { ContextRail } from "@/components/feed/ContextRail";', content)

            if content != orig:
                with open(path, 'w') as f:
                    f.write(content)
                print(f"Updated {path}")
