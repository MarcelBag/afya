"""
Endo Health AI-Solutions Engineer Challenge - MCP Extension
File: mcp_server.py

This script demonstrates a Model Context Protocol (MCP) server that exposes 
the Brand-Coherent Image Generator as a 'tool' for LLMs.

Keywords: MCP, Agentic Workflows, Tool-Use.
"""

import os
from typing import List, Optional
from mcp.server.fastmcp import FastMCP
from submission_script import generate_header, generate_headers_batch

# Initialize FastMCP Server
mcp = FastMCP("Afya-Visual-Agent")

@mcp.tool()
def create_blog_image(title: str) -> str:
    """
    Generates a medical blog header image that is style-consistent with the Endo Health brand.
    
    Args:
        title: The topic or title of the blog post.
        
    Returns:
        The path to the generated image.
    """
    path, error = generate_header(title)
    if error:
        return f"Error generating image: {error}"
    return f"Image successfully generated at: {path}"

@mcp.tool()
def batch_generate_headers(titles: List[str]) -> str:
    """
    Generates multiple consistent images for a list of blog titles.
    
    Args:
        titles: A list of string titles.
    """
    results = generate_headers_batch(titles)
    success_count = len([r for r in results if 'image' in r])
    return f"Batch processing complete. Generated {success_count} brand-coherent images."

if __name__ == "__main__":
    # In a real environment, you'd run this via an MCP-compatible host (like Claude Desktop)
    print("--- Afya MCP Server for Endo Health ---")
    print("This server is ready to be connected to an Agentic Workflow.")
    print("Exposed Tools: create_blog_image, batch_generate_headers")
    mcp.run()
