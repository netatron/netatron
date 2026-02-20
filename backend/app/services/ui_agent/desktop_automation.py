"""
Desktop Automation Service
Enables agent to interact with desktop, browser, and system applications
Uses Playwright for browser automation and system-level libraries for desktop control
"""

from __future__ import annotations

import logging
import base64
import io
from typing import Dict, Any, Optional, List, Tuple
from pathlib import Path
import asyncio

try:
    from playwright.async_api import async_playwright, Browser, BrowserContext, Page
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    Browser = None
    BrowserContext = None
    Page = None

# Platform-specific desktop automation
import platform
DESKTOP_AUTOMATION_AVAILABLE = False
Application = None

if platform.system() == "Windows":
    try:
        import pywinauto
        from pywinauto import Application
        DESKTOP_AUTOMATION_AVAILABLE = True
    except ImportError:
        pass

# Try pyautogui for all platforms (fallback)
try:
    import pyautogui
    if not DESKTOP_AUTOMATION_AVAILABLE:
        DESKTOP_AUTOMATION_AVAILABLE = True
except ImportError:
    pass

logger = logging.getLogger(__name__)

# Import config to check if desktop automation is enabled
try:
    from app.config import ENABLE_DESKTOP_AUTOMATION, DESKTOP_AUTOMATION_PLATFORM
except ImportError:
    ENABLE_DESKTOP_AUTOMATION = False
    DESKTOP_AUTOMATION_PLATFORM = "windows"


class DesktopAutomationService:
    """
    Service for desktop-level automation.
    Enables agent to:
    - Control browser (multiple tabs, windows)
    - Interact with desktop applications
    - Capture screenshots of entire desktop
    - Navigate between applications
    """
    
    def __init__(self):
        self.playwright = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.pages: Dict[str, Page] = {}
        self.is_initialized = False
        self.is_enabled = ENABLE_DESKTOP_AUTOMATION
        self.platform_filter = DESKTOP_AUTOMATION_PLATFORM
        self.current_platform = platform.system()
        self.requires_uac = False  # Will be set based on operations
    
    def check_enabled(self) -> Tuple[bool, str]:
        """
        Check if desktop automation is enabled and available.
        
        Returns:
            Tuple of (is_enabled, message)
        """
        if not self.is_enabled:
            return False, "Desktop automation is disabled. Set ENABLE_DESKTOP_AUTOMATION=true to enable."
        
        # Check platform filter
        if self.platform_filter != "all":
            if self.current_platform.lower() != self.platform_filter.lower():
                return False, f"Desktop automation is configured for {self.platform_filter}, but running on {self.current_platform}"
        
        # Check if libraries are available
        if not DESKTOP_AUTOMATION_AVAILABLE:
            return False, "Desktop automation libraries not installed. Install: pip install pywinauto mss pyautogui (Windows)"
        
        return True, "Desktop automation is enabled and available"
    
    async def initialize(self):
        """
        Initialize Playwright and browser.
        Checks if desktop automation is enabled before initializing.
        """
        # Check if enabled
        is_enabled, message = self.check_enabled()
        if not is_enabled:
            logger.warning(f"Desktop automation not enabled: {message}")
            return
        
        if not PLAYWRIGHT_AVAILABLE:
            logger.warning("Playwright not available. Desktop automation limited.")
            return
        
        try:
            self.playwright = await async_playwright().start()
            # Launch browser in non-headless mode for desktop interaction
            self.browser = await self.playwright.chromium.launch(
                headless=False,
                args=['--start-maximized']
            )
            self.context = await self.browser.new_context(
                viewport={'width': 1920, 'height': 1080}
            )
            self.is_initialized = True
            logger.info("Desktop automation initialized")
        except Exception as e:
            logger.error(f"Failed to initialize desktop automation: {e}")
            self.is_initialized = False
    
    async def capture_desktop_screenshot(self) -> str:
        """
        Capture screenshot of entire desktop.
        Returns base64 encoded image.
        """
        try:
            if platform.system() == "Windows":
                # Windows: use pywinauto or mss
                try:
                    import mss
                    with mss.mss() as sct:
                        # Capture all monitors
                        screenshot = sct.grab(sct.monitors[0])
                        img = mss.tools.to_png(screenshot.rgb, screenshot.size)
                        return base64.b64encode(img).decode('utf-8')
                except ImportError:
                    logger.warning("mss not available, using browser screenshot")
                    # Fallback to browser screenshot
                    if self.context and self.context.pages:
                        page = self.context.pages[0]
                        screenshot_bytes = await page.screenshot(full_page=True)
                        return base64.b64encode(screenshot_bytes).decode('utf-8')
            else:
                # Linux/Mac: use pyautogui or similar
                try:
                    import pyautogui
                    screenshot = pyautogui.screenshot()
                    img_bytes = io.BytesIO()
                    screenshot.save(img_bytes, format='PNG')
                    return base64.b64encode(img_bytes.getvalue()).decode('utf-8')
                except Exception as e:
                    logger.warning(f"Desktop screenshot failed: {e}")
                    return ""
        except Exception as e:
            logger.error(f"Error capturing desktop screenshot: {e}")
            return ""
    
    async def capture_browser_screenshot(self, page_id: Optional[str] = None) -> str:
        """
        Capture screenshot of browser page.
        
        Args:
            page_id: Optional page identifier. If None, uses first page.
        
        Returns:
            Base64 encoded screenshot
        """
        if not self.is_initialized or not self.context:
            return ""
        
        try:
            if page_id and page_id in self.pages:
                page = self.pages[page_id]
            elif self.context.pages:
                page = self.context.pages[0]
            else:
                return ""
            
            screenshot_bytes = await page.screenshot(full_page=True)
            return base64.b64encode(screenshot_bytes).decode('utf-8')
        except Exception as e:
            logger.error(f"Error capturing browser screenshot: {e}")
            return ""
    
    async def open_browser_page(self, url: Optional[str] = None, page_id: Optional[str] = None) -> str:
        """
        Open new browser page or navigate existing one.
        
        Args:
            url: URL to navigate to (if None, opens blank page)
            page_id: Optional identifier for the page
        
        Returns:
            Page identifier
        """
        if not self.is_initialized:
            await self.initialize()
        
        if not self.context:
            raise RuntimeError("Browser context not initialized")
        
        try:
            page = await self.context.new_page()
            page_id = page_id or f"page_{len(self.pages)}"
            
            if url:
                await page.goto(url, wait_until='networkidle')
            
            self.pages[page_id] = page
            logger.info(f"Opened browser page: {page_id} at {url or 'blank'}")
            return page_id
        except Exception as e:
            logger.error(f"Error opening browser page: {e}")
            raise
    
    async def execute_browser_action(
        self,
        page_id: str,
        action_type: str,
        selector: str,
        value: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Execute action on browser page.
        
        Args:
            page_id: Page identifier
            action_type: click, fill, select, etc.
            selector: CSS selector or text
            value: Optional value for fill/select actions
        
        Returns:
            Result dictionary
        """
        if page_id not in self.pages:
            return {"success": False, "error": f"Page {page_id} not found"}
        
        page = self.pages[page_id]
        
        try:
            if action_type == "click":
                await page.click(selector)
                return {"success": True, "action": "click", "selector": selector}
            
            elif action_type == "fill":
                await page.fill(selector, value or "")
                return {"success": True, "action": "fill", "selector": selector, "value": value}
            
            elif action_type == "select":
                await page.select_option(selector, value or "")
                return {"success": True, "action": "select", "selector": selector, "value": value}
            
            elif action_type == "navigate":
                await page.goto(value or selector, wait_until='networkidle')
                return {"success": True, "action": "navigate", "url": value or selector}
            
            elif action_type == "screenshot":
                screenshot_bytes = await page.screenshot(full_page=True)
                screenshot_b64 = base64.b64encode(screenshot_bytes).decode('utf-8')
                return {"success": True, "action": "screenshot", "screenshot": screenshot_b64}
            
            else:
                return {"success": False, "error": f"Unknown action type: {action_type}"}
        
        except Exception as e:
            logger.error(f"Error executing browser action: {e}")
            return {"success": False, "error": str(e)}
    
    async def get_browser_pages_info(self) -> List[Dict[str, Any]]:
        """
        Get information about all open browser pages.
        
        Returns:
            List of page information dictionaries
        """
        if not self.context:
            return []
        
        pages_info = []
        for page_id, page in self.pages.items():
            try:
                url = page.url
                title = await page.title()
                pages_info.append({
                    "page_id": page_id,
                    "url": url,
                    "title": title,
                })
            except Exception as e:
                logger.warning(f"Error getting info for page {page_id}: {e}")
        
        return pages_info
    
    async def execute_desktop_action(
        self,
        action_type: str,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Execute system-level desktop action.
        
        Supported actions:
        - open_application: Launch desktop application
        - click_coordinates: Click at screen coordinates
        - type_text: Type text (global)
        - key_press: Press keyboard key
        - switch_application: Switch to another application
        
        NOTE: Most operations do NOT require UAC, but some may trigger Windows UAC:
        - Opening system applications (like Control Panel) may require UAC
        - Modifying system settings may require UAC
        - Regular applications (Notepad, Chrome, etc.) do NOT require UAC
        
        Args:
            action_type: Type of action
            **kwargs: Action-specific parameters
        
        Returns:
            Result dictionary with success status and any warnings
        """
        # Check if enabled
        is_enabled, message = self.check_enabled()
        if not is_enabled:
            return {"success": False, "error": message, "requires_enable": True}
        
        if not DESKTOP_AUTOMATION_AVAILABLE:
            return {"success": False, "error": "Desktop automation libraries not available"}
        
        try:
            if platform.system() == "Windows":
                result = await self._execute_windows_action(action_type, **kwargs)
                # Add UAC warning if applicable
                if action_type == "open_application":
                    app_path = kwargs.get("path", "").lower()
                    # System apps that might require UAC
                    system_apps = ["control", "cmd", "powershell", "regedit", "gpedit", "services.msc"]
                    if any(sys_app in app_path for sys_app in system_apps):
                        result["uac_warning"] = "This application may trigger Windows UAC prompt"
                return result
            else:
                return await self._execute_unix_action(action_type, **kwargs)
        except PermissionError as e:
            logger.error(f"Permission error executing desktop action: {e}")
            return {
                "success": False,
                "error": str(e),
                "uac_required": True,
                "message": "This action may require administrator privileges (UAC)"
            }
        except Exception as e:
            logger.error(f"Error executing desktop action: {e}")
            return {"success": False, "error": str(e)}
    
    async def _execute_windows_action(self, action_type: str, **kwargs) -> Dict[str, Any]:
        """Execute action on Windows"""
        try:
            if action_type == "open_application":
                app_path = kwargs.get("path")
                if app_path:
                    import subprocess
                    subprocess.Popen([app_path])
                    return {"success": True, "action": "open_application", "path": app_path}
            
            elif action_type == "click_coordinates":
                x = kwargs.get("x", 0)
                y = kwargs.get("y", 0)
                try:
                    import pyautogui
                    pyautogui.click(x, y)
                    return {"success": True, "action": "click", "coordinates": (x, y)}
                except Exception as e:
                    return {"success": False, "error": str(e)}
            
            elif action_type == "type_text":
                text = kwargs.get("text", "")
                import pyautogui
                pyautogui.write(text)
                return {"success": True, "action": "type", "text": text}
            
            elif action_type == "key_press":
                key = kwargs.get("key", "")
                import pyautogui
                pyautogui.press(key)
                return {"success": True, "action": "key_press", "key": key}
            
            return {"success": False, "error": f"Unknown action: {action_type}"}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def _execute_unix_action(self, action_type: str, **kwargs) -> Dict[str, Any]:
        """Execute action on Linux/Mac"""
        try:
            import pyautogui
            
            if action_type == "click_coordinates":
                x = kwargs.get("x", 0)
                y = kwargs.get("y", 0)
                pyautogui.click(x, y)
                return {"success": True, "action": "click", "coordinates": (x, y)}
            
            elif action_type == "type_text":
                text = kwargs.get("text", "")
                pyautogui.write(text)
                return {"success": True, "action": "type", "text": text}
            
            elif action_type == "key_press":
                key = kwargs.get("key", "")
                pyautogui.press(key)
                return {"success": True, "action": "key_press", "key": key}
            
            return {"success": False, "error": f"Unknown action: {action_type}"}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def get_desktop_context(self) -> Dict[str, Any]:
        """
        Get current desktop context (open applications, windows, etc.)
        
        Returns:
            Context dictionary with status and availability info
        """
        is_enabled, message = self.check_enabled()
        
        context = {
            "platform": platform.system(),
            "browser_pages": await self.get_browser_pages_info(),
            "desktop_automation_available": DESKTOP_AUTOMATION_AVAILABLE,
            "playwright_available": PLAYWRIGHT_AVAILABLE,
            "is_enabled": is_enabled,
            "enabled_message": message,
            "is_initialized": self.is_initialized,
            "requires_uac": self.requires_uac,
            "uac_info": (
                "Most desktop automation operations do NOT require UAC. "
                "Only system-level operations (opening Control Panel, modifying system settings) may trigger UAC."
            ) if platform.system() == "Windows" else "UAC is Windows-specific",
        }
        
        return context
    
    async def cleanup(self):
        """Cleanup resources"""
        try:
            if self.browser:
                await self.browser.close()
            if self.playwright:
                await self.playwright.stop()
            self.is_initialized = False
            logger.info("Desktop automation cleaned up")
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")


# Global instance
desktop_automation = DesktopAutomationService()

