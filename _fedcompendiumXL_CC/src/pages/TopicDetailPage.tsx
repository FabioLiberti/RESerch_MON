// src/pages/TopicDetailPage.tsx
import React, { useEffect, useState } from 'react';
import { Box, Heading, Text, Badge, Button, Spinner, Code, Flex, Divider, Link, Grid, GridItem } from '@chakra-ui/react';
import { ArrowBackIcon } from '@chakra-ui/icons';

interface TopicDetail {
  id: string;
  title: string;
  category: string[] | string;
  difficulty: string;
  description: string;
  content: string;
  relatedTopics?: Array<{id: string, title: string}>;
  relatedPapers?: Array<{id: string, title: string, authors: string}>;
  codeExamples?: Array<{title: string, language: string, code: string}>;
}

interface TopicDetailPageProps {
  topicId: string;
  onBackToCompendium: () => void;
}

const TopicDetailPage: React.FC<TopicDetailPageProps> = ({ topicId, onBackToCompendium }) => {
  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTopicDetail = async () => {
      try {
        console.log(`Fetching topic details for: ${topicId}`);
        // In production, this would be an API call
        const response = await fetch(`/data/topics/${topicId}.json`);
        console.log('Response status:', response.status);
        
        if (!response.ok) {
          throw new Error(`Topic not found (${response.status})`);
        }
        
        const data = await response.json();
        console.log('Topic data loaded:', data);
        setTopic(data);
        setError(null);
      } catch (error) {
        console.error('Error fetching topic details:', error);
        setError('Failed to load topic details.');
      } finally {
        setLoading(false);
      }
    };

    if (topicId) {
      fetchTopicDetail();
    }
  }, [topicId]);

  const getCategoryColor = (category: string) => {
    switch (category.toLowerCase()) {
      case 'basics': return 'purple';
      case 'algorithms': return 'blue';
      case 'applications': return 'green';
      case 'privacy': return 'red';
      case 'systems': return 'orange';
      default: return 'gray';
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty.toLowerCase()) {
      case 'beginner': return 'green';
      case 'intermediate': return 'orange';
      case 'advanced': return 'red';
      default: return 'gray';
    }
  };

  if (loading) {
    return (
      <Box textAlign="center" py={10}>
        <Spinner size="xl" />
        <Text mt={4}>Loading topic details...</Text>
      </Box>
    );
  }

  if (error || !topic) {
    return (
      <Box textAlign="center" py={10}>
        <Heading size="lg" mb={4}>Error</Heading>
        <Text mb={4}>{error || "Topic not found"}</Text>
        <Button colorScheme="blue" onClick={onBackToCompendium}>
          Back to Compendium
        </Button>
      </Box>
    );
  }

  // Normalizza la categoria in array nel caso sia una singola stringa
  const categories = Array.isArray(topic.category) ? topic.category : [topic.category];

  return (
    <Box maxW="1200px" mx="auto" py={6} px={4}>
      <Button 
        leftIcon={<ArrowBackIcon />} 
        variant="ghost" 
        mb={6}
        onClick={onBackToCompendium}
      >
        Back to Compendium
      </Button>

      <Box 
        bg="white" 
        p={6} 
        borderRadius="lg" 
        boxShadow="sm"
        _dark={{ bg: "gray.800" }}
      >
        <Flex justify="space-between" align="flex-start" wrap="wrap" mb={4}>
          <Heading as="h1" size="xl" mb={2}>
            {topic.title}
          </Heading>
          
          <Flex gap={2} mt={1} mb={2}>
            {categories.map((cat, index) => (
              <Badge key={index} colorScheme={getCategoryColor(cat)} fontSize="0.8em" p={1}>
                {cat.toUpperCase()}
              </Badge>
            ))}
            <Badge colorScheme={getDifficultyColor(topic.difficulty)} fontSize="0.8em" p={1}>
              {topic.difficulty.toUpperCase()}
            </Badge>
          </Flex>
        </Flex>
        
        <Text fontSize="lg" color="gray.600" _dark={{ color: "gray.400" }} mb={8}>
          {topic.description}
        </Text>

        <Divider my={6} />
        
        <Box mb={8}>
          <Heading as="h2" size="lg" mb={4}>
            Learning Content
          </Heading>
          <Box 
            className="content-section"
            sx={{
              '& h3': { fontSize: 'xl', fontWeight: 'bold', mt: 6, mb: 3 },
              '& p': { mb: 4, lineHeight: 1.7 },
              '& ul, & ol': { pl: 5, mb: 4 },
              '& li': { mb: 2 },
              '& code': { bg: 'gray.100', px: 1, borderRadius: 'sm', _dark: { bg: 'gray.700' } }
            }}
            dangerouslySetInnerHTML={{ __html: topic.content }}
          />
        </Box>
        
        {topic.codeExamples && topic.codeExamples.length > 0 && (
          <>
            <Divider my={6} />
            <Box mb={8}>
              <Heading as="h2" size="lg" mb={4}>
                Code Examples
              </Heading>
              {topic.codeExamples.map((example, index) => (
                <Box key={index} mb={6}>
                  <Heading as="h3" size="md" mb={3}>
                    {example.title}
                  </Heading>
                  <Box 
                    bg="gray.50" 
                    p={4} 
                    borderRadius="md" 
                    overflow="auto"
                    _dark={{ bg: "gray.700" }}
                  >
                    <pre style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                      <code>{example.code}</code>
                    </pre>
                  </Box>
                </Box>
              ))}
            </Box>
          </>
        )}
        
        {topic.relatedPapers && topic.relatedPapers.length > 0 && (
          <>
            <Divider my={6} />
            <Box mb={8}>
              <Heading as="h2" size="lg" mb={4}>
                Related Research Papers
              </Heading>
              <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap={4}>
                {topic.relatedPapers.map((paper, index) => (
                  <GridItem
                    key={index}
                    p={4}
                    border="1px"
                    borderColor="gray.200"
                    borderRadius="md"
                    _dark={{ borderColor: "gray.600" }}
                  >
                    <Heading as="h3" size="md" mb={2}>
                      {paper.title}
                    </Heading>
                    <Text fontSize="sm" color="gray.600" _dark={{ color: "gray.400" }} mb={3}>
                      {paper.authors}
                    </Text>
                    <Button as="a" href={`/papers/${paper.id}`} size="sm" colorScheme="blue">
                      View Paper
                    </Button>
                  </GridItem>
                ))}
              </Grid>
            </Box>
          </>
        )}
        
        {topic.relatedTopics && topic.relatedTopics.length > 0 && (
          <>
            <Divider my={6} />
            <Box>
              <Heading as="h2" size="lg" mb={4}>
                Related Topics
              </Heading>
              <Flex flexWrap="wrap" gap={2}>
                {topic.relatedTopics.map((relatedTopic, index) => (
                  <Button
                    key={index}
                    as="a"
                    href={`/topic/${relatedTopic.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      // Aggiorna l'URL senza ricaricare la pagina
                      window.history.pushState(null, "", `/topic/${relatedTopic.id}`);
                      window.location.reload(); // In una vera SPA, qui utilizzeresti il router
                    }}
                    size="sm"
                    variant="outline"
                  >
                    {relatedTopic.title}
                  </Button>
                ))}
              </Flex>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
};

export default TopicDetailPage;