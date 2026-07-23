import os
import re

files = [
    "/Users/mahmoud/Dev/rmhstudios.com/components/creator-studio/EarningsTab.tsx",
    "/Users/mahmoud/Dev/rmhstudios.com/components/creator-studio/StudioDashboard.tsx",
    "/Users/mahmoud/Dev/rmhstudios.com/components/creator/TierEditor.tsx",
    "/Users/mahmoud/Dev/rmhstudios.com/components/circle/CircleManager.tsx",
    "/Users/mahmoud/Dev/rmhstudios.com/components/homes/ImageUploader.tsx",
    "/Users/mahmoud/Dev/rmhstudios.com/components/homes/ListingCard.tsx",
    "/Users/mahmoud/Dev/rmhstudios.com/components/homes/WatchButton.tsx",
    "/Users/mahmoud/Dev/rmhstudios.com/components/homes/ListingDetailView.tsx",
    "/Users/mahmoud/Dev/rmhstudios.com/components/homes/FavoriteButton.tsx",
    "/Users/mahmoud/Dev/rmhstudios.com/components/membership/MembershipPanel.tsx",
    "/Users/mahmoud/Dev/rmhstudios.com/components/settings/ThemeGallery.tsx",
    "/Users/mahmoud/Dev/rmhstudios.com/components/settings/NotificationSettings.tsx",
    "/Users/mahmoud/Dev/rmhstudios.com/components/settings/ProfileCosmetics.tsx",
    "/Users/mahmoud/Dev/rmhstudios.com/components/settings/AccentPicker.tsx",
    "/Users/mahmoud/Dev/rmhstudios.com/components/settings/GlassClarityControl.tsx",
    "/Users/mahmoud/Dev/rmhstudios.com/components/settings/AppearancePanel.tsx",
    "/Users/mahmoud/Dev/rmhstudios.com/components/rmhcoins/PlinkoGame.tsx",
    "/Users/mahmoud/Dev/rmhstudios.com/components/daily-puzzles/AlibiGame.tsx",
]

for filepath in files:
    try:
        with open(filepath, 'r') as f:
            content = f.read()

        original_content = content
        
        # Remove glass-related classes
        content = re.sub(r'\bglass-(inset|fill|pane|chrome|overlay|noise|glint)\b', '', content)
        
        # Remove backdrop-blur and backdrop-filter
        content = re.sub(r'\bbackdrop-blur(?:-\w+|-\[[^\]]+\])?\b', '', content)
        
        # Background replacements
        content = re.sub(r'\bbg-site-glass-tint\b', 'bg-site-surface', content)
        content = re.sub(r'\bbg-site-glass\b', 'bg-site-surface', content)
        content = re.sub(r'\bbg-site-surface/60\b', 'bg-site-surface', content)
        
        # Border replacements
        content = re.sub(r'\bborder-site-border/70\b', 'border-site-border', content)
        content = re.sub(r'\bborder-transparent\b', 'border-site-border', content)
        
        # Shadow replacements
        content = re.sub(r'\bshadow-inner\b', 'shadow-xs', content)
        
        # Hover border replacements
        content = re.sub(r'\bhover:border-site-border-bright\b', 'hover:border-site-text/40', content)

        if content != original_content:
            with open(filepath, 'w') as f:
                f.write(content)
            print(f"Updated: {filepath}")
    except Exception as e:
        print(f"Error processing {filepath}: {e}")
