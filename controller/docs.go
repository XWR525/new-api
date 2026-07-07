package controller

import (
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/gin-gonic/gin"
)

// docsPath returns the filesystem path to the docs directory.
// In dev Docker, this is mounted as a volume (e.g., /app/docs).
// Falls back to reading from the source tree relative to the working directory.
func docsPath() string {
	if p := os.Getenv("DOCS_PATH"); p != "" {
		return p
	}
	// Default: look for docs alongside the binary or in common dev paths
	return "web/default/src/docs"
}

// GetDocsList returns a sorted list of available markdown documents.
func GetDocsList(c *gin.Context) {
	dir := docsPath()
	entries, err := os.ReadDir(dir)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    []map[string]string{},
		})
		return
	}

	type docEntry struct {
		Slug  string `json:"slug"`
		Title string `json:"title"`
	}

	docs := make([]docEntry, 0)
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		slug := strings.TrimSuffix(e.Name(), ".md")
		// Try to extract title from the file
		content, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			continue
		}
		title := slug
		// Extract first # heading
		lines := strings.SplitN(string(content), "\n", 3)
		for _, line := range lines {
			if strings.HasPrefix(line, "# ") {
				title = strings.TrimPrefix(line, "# ")
				break
			}
		}
		docs = append(docs, docEntry{Slug: slug, Title: title})
	}

	sort.Slice(docs, func(i, j int) bool {
		return docs[i].Slug < docs[j].Slug
	})

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    docs,
	})
}

// GetDocContent returns the raw markdown content of a specific document.
func GetDocContent(c *gin.Context) {
	filename := c.Param("filename")
	// Prevent directory traversal
	filename = filepath.Base(filename)
	if !strings.HasSuffix(filename, ".md") {
		filename += ".md"
	}

	filePath := filepath.Join(docsPath(), filename)
	content, err := os.ReadFile(filePath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "Document not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    string(content),
	})
}
