 
taskkill /F /IM chrome.exe 2>nul
 
"C:\Program Files\Google\Chrome\Application\chrome.exe" \
  --remote-debugging-port=9222 \
  --user-data-dir="C:\Users\sunguozhen\AppData\Local\Google\Chrome\User Data\Default" \
  --profile-directory="Default" \
  --disable-blink-features=AutomationControlled \
  --exclude-switches=enable-automation \
  --disable-infobars \
  --no-first-run \
  --start-maximized
