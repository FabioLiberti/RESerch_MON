import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Heading,
  Text,
  Input,
  InputGroup,
  InputLeftElement,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Grid,
  GridItem,
  Card,
  CardBody,
  CardFooter,
  Flex,
  HStack,
  Stack,
  VStack,
  Button,
  IconButton,
  Tag,
  Badge,
  List,
  ListItem,
  useColorModeValue,
  Divider
} from '@chakra-ui/react';
import { SearchIcon, DownloadIcon, ExternalLinkIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { FiFilter, FiBookmark, FiMapPin, FiBook, FiLayers, FiCode, FiCpu, FiInfo } from 'react-icons/fi';

// Type per le categorie e difficoltà
type Category = 'basics' | 'algorithms' | 'applications' | 'privacy' | 'systems';
type Difficulty = 'beginner' | 'intermediate' | 'advanced';

// Categorie e difficoltà disponibili
const CATEGORIES: Category[] = ['basics', 'algorithms', 'applications', 'privacy', 'systems'];
const DIFFICULTIES: Difficulty[] = ['beginner', 'intermediate', 'advanced'];

// In a real implementation, you would import your data from a JSON file or API
// import topics from '../data/topics.json';
// Mock data for the example
const topics = [
  {
    id: 'intro-fl',
    title: 'Introduction to Federated Learning',
    description: 'Learn the fundamentals of federated learning and how it differs from traditional centralized machine learning approaches.',
    category: ['basics'],
    difficulty: 'beginner',
    tags: ['introduction', 'overview']
  },
  {
    id: 'fedavg',
    title: 'Federated Averaging (FedAvg)',
    description: 'Understand the canonical federated averaging algorithm, its implementation details and convergence properties.',
    category: ['algorithms'],
    difficulty: 'beginner',
    tags: ['algorithm', 'model-aggregation']
  },
  {
    id: 'non-iid',
    title: 'Dealing with Non-IID Data',
    description: 'Explore techniques for handling statistical heterogeneity in federated networks and improving model convergence.',
    category: ['algorithms'],
    difficulty: 'intermediate',
    tags: ['heterogeneity', 'convergence']
  },
  {
    id: 'diff-privacy',
    title: 'Differential Privacy in Federated Learning',
    description: 'Learn how to implement differential privacy mechanisms to provide formal privacy guarantees in federated systems.',
    category: ['privacy'],
    difficulty: 'advanced',
    tags: ['privacy', 'security']
  },
  {
    id: 'secure-agg',
    title: 'Secure Aggregation Protocols',
    description: 'Understand cryptographic techniques for secure model aggregation without revealing individual client updates.',
    category: ['privacy'],
    difficulty: 'advanced',
    tags: ['privacy', 'security', 'cryptography']
  },
  {
    id: 'fl-healthcare',
    title: 'Federated Learning for Healthcare',
    description: 'Explore applications of federated learning in healthcare, including FHIR integration and regulatory considerations.',
    category: ['applications'],
    difficulty: 'intermediate',
    tags: ['healthcare', 'applications']
  },
  {
    id: 'fl-edge',
    title: 'Federated Learning on Edge Devices',
    description: 'Implement federated learning on resource-constrained IoT and edge devices with communication efficiency.',
    category: ['systems'],
    difficulty: 'intermediate',
    tags: ['edge', 'IoT', 'optimization']
  },
  {
    id: 'personalization',
    title: 'Personalization in Federated Learning',
    description: 'Techniques for adapting global models to local data distributions while maintaining global performance.',
    category: ['algorithms'],
    difficulty: 'advanced',
    tags: ['personalization', 'adaptation']
  }
];

// Dummy data per gli algoritmi
const algorithms = [
  {
    id: 'fedavg-algo',
    name: 'Federated Averaging (FedAvg)',
    description: 'A communication-efficient algorithm for federated learning that averages model updates from clients.',
    advantages: ['Simple to implement', 'Communication efficient', 'Works well with IID data'],
    limitations: ['Convergence issues with non-IID data', 'Vulnerable to model poisoning'],
    paper: 'Communication-Efficient Learning of Deep Networks from Decentralized Data',
    authors: 'McMahan et al.',
    year: 2017
  },
  {
    id: 'fedprox-algo',
    name: 'FedProx',
    description: 'An extension of FedAvg that adds a proximal term to stabilize training with heterogeneous data.',
    advantages: ['Better convergence on non-IID data', 'More robust than FedAvg'],
    limitations: ['Additional computational cost', 'Requires tuning of proximal parameter'],
    paper: 'Federated Optimization in Heterogeneous Networks',
    authors: 'Li et al.',
    year: 2018
  }
];

// Funzione per ottenere l'icona della categoria
const getCategoryIcon = (category: string) => {
  switch(category) {
    case 'basics':
      return FiBook;
    case 'algorithms':
      return FiLayers;
    case 'applications':
      return FiCode;
    case 'privacy':
      return FiInfo;
    case 'systems':
      return FiCpu;
    default:
      return FiBook;
  }
};

// Function to get badge color based on difficulty
const getDifficultyColor = (difficulty: string) => {
  switch(difficulty) {
    case 'beginner':
      return 'green';
    case 'intermediate':
      return 'orange';
    case 'advanced':
      return 'red';
    default:
      return 'gray';
  }
};

// Function to get badge color based on category
const getCategoryColor = (category: string) => {
  switch(category) {
    case 'basics':
      return 'blue';
    case 'algorithms':
      return 'purple';
    case 'privacy':
      return 'red';
    case 'applications':
      return 'orange';
    case 'systems':
      return 'cyan';
    default:
      return 'gray';
  }
};

interface CompendiumPageProps {
  onViewLearningPath?: () => void;
}

const CompendiumPage: React.FC<CompendiumPageProps> = ({ onViewLearningPath }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [tabIndex, setTabIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty | null>(null);
  const [filteredTopics, setFilteredTopics] = useState(topics);
  
  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const accentBg = useColorModeValue('blue.50', 'blue.900');
  
  // Filter topics based on search term, category and difficulty
  useEffect(() => {
    let filtered = [...topics];
    
    // Apply search filter if there's a search term
    if (searchTerm) {
      filtered = filtered.filter(topic => 
        topic.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        topic.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        topic.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    // Apply category filter if selected
    if (selectedCategory) {
      filtered = filtered.filter(topic => 
        topic.category.includes(selectedCategory)
      );
    }
    
    // Apply difficulty filter if selected
    if (selectedDifficulty) {
      filtered = filtered.filter(topic => 
        topic.difficulty === selectedDifficulty
      );
    }
    
    setFilteredTopics(filtered);
  }, [searchTerm, selectedCategory, selectedDifficulty]);
  
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };
  
  const handleCategorySelect = (category: Category) => {
    setSelectedCategory(selectedCategory === category ? null : category);
  };
  
  const handleDifficultySelect = (difficulty: Difficulty) => {
    setSelectedDifficulty(selectedDifficulty === difficulty ? null : difficulty);
  };
  
  const handleTabChange = (index: number) => {
    setTabIndex(index);
  };

  const clearFilters = () => {
    setSelectedCategory(null);
    setSelectedDifficulty(null);
    setSearchTerm('');
  };
  
  const handleTopicClick = (topicId: string) => {
    window.history.pushState(null, "", `/topic/${topicId}`);
    window.location.reload(); // In a real app, you'd use React Router instead
  };
  
  return (
    <Container maxW="container.xl" py={5}>
      <Flex justifyContent="space-between" alignItems="center" mb={6}>
        <Box>
          <Heading as="h1" size="xl">Federated Learning Compendium</Heading>
          <Text mt={2}>A comprehensive guide to federated learning concepts, algorithms, and implementations</Text>
        </Box>
        <HStack spacing={3}>
          <Button 
            leftIcon={<DownloadIcon />} 
            variant="outline"
          >
            Download PDF
          </Button>
          <Button 
            leftIcon={<Box as={FiMapPin as React.ElementType} />} 
            colorScheme="blue"
            onClick={onViewLearningPath}
          >
            Learning Path
          </Button>
        </HStack>
      </Flex>
      
      <Card mb={6} variant="outline" bg={cardBg}>
        <CardBody>
          <Flex justifyContent="space-between" alignItems="center">
            <InputGroup maxW="600px">
              <InputLeftElement pointerEvents="none">
                <SearchIcon color="gray.400" />
              </InputLeftElement>
              <Input 
                placeholder="Search for topics, algorithms, or concepts" 
                value={searchTerm}
                onChange={handleSearchChange}
              />
            </InputGroup>
            <IconButton
              aria-label="Filter topics"
              icon={<Box as={FiFilter as React.ElementType} />}
              variant="ghost"
            />
          </Flex>
        </CardBody>
      </Card>
      
      <Tabs variant="soft-rounded" colorScheme="blue" onChange={handleTabChange} mb={6}>
        <TabList overflowX="auto" overflowY="hidden" pb={1}>
          <Tab>Topics</Tab>
          <Tab>Algorithms</Tab>
          <Tab>Tutorials</Tab>
          <Tab>Resources</Tab>
        </TabList>
        
        <TabPanels>
          {/* Topics Tab Panel */}
          <TabPanel p={0} pt={4}>
            <Grid templateColumns={{ base: '1fr', md: '250px 1fr' }} gap={6}>
              {/* Sidebar con filtri */}
              <GridItem>
                <VStack align="start" spacing={6}>
                  <Box width="100%">
                    <Heading size="md" mb={4}>Filters</Heading>
                    
                    <Box mb={4}>
                      <Heading size="sm" mb={2}>Categories</Heading>
                      <VStack align="start" spacing={1}>
                        {CATEGORIES.map((category) => (
                          <Button
                            key={category}
                            size="sm"
                            variant={selectedCategory === category ? 'solid' : 'ghost'}
                            colorScheme={selectedCategory === category ? 'blue' : 'gray'}
                            leftIcon={<Box as={getCategoryIcon(category) as React.ElementType} />}
                            justifyContent="flex-start"
                            width="100%"
                            onClick={() => handleCategorySelect(category)}
                          >
                            {category.charAt(0).toUpperCase() + category.slice(1)}
                          </Button>
                        ))}
                      </VStack>
                    </Box>
                    
                    <Box>
                      <Heading size="sm" mb={2}>Difficulty</Heading>
                      <VStack align="start" spacing={1}>
                        {DIFFICULTIES.map((difficulty) => (
                          <Button
                            key={difficulty}
                            size="sm"
                            variant={selectedDifficulty === difficulty ? 'solid' : 'ghost'}
                            colorScheme={selectedDifficulty === difficulty ? 'blue' : 'gray'}
                            justifyContent="flex-start"
                            width="100%"
                            onClick={() => handleDifficultySelect(difficulty)}
                          >
                            {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
                          </Button>
                        ))}
                      </VStack>
                    </Box>
                  </Box>
                </VStack>
              </GridItem>
              
              {/* Main content - Topic cards */}
              <GridItem>
                <Flex justify="space-between" align="center" mb={4}>
                  <Heading as="h2" size="md">{filteredTopics.length} Topics</Heading>
                  {(selectedCategory || selectedDifficulty || searchTerm) && (
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      colorScheme="blue"
                      onClick={clearFilters}
                    >
                      Clear Filters
                    </Button>
                  )}
                </Flex>
                
                <Grid templateColumns={["1fr", "1fr", "repeat(2, 1fr)"]} gap={4}>
                  {filteredTopics.map((topic) => (
                    <Card 
                      key={topic.id} 
                      variant="outline" 
                      bg={cardBg}
                      borderColor={borderColor}
                      overflow="hidden"
                      transition="all 0.2s"
                      _hover={{ 
                        transform: 'translateY(-4px)', 
                        shadow: 'md',
                        borderColor: 'blue.400'
                      }}
                    >
                      <CardBody>
                        <Flex mb={3}>
                          <Box
                            p={2}
                            bg={accentBg}
                            borderRadius="md"
                            color="blue.500"
                            mr={3}
                          >
                            <Box as={getCategoryIcon(topic.category[0]) as React.ElementType} />
                          </Box>
                          <Box>
                            <Heading size="md" mb={1}>
                              {topic.title}
                            </Heading>
                            <Flex gap={2} mb={2} wrap="wrap">
                              {topic.category.map((cat) => (
                                <Badge key={cat} colorScheme={getCategoryColor(cat)}>
                                  {cat}
                                </Badge>
                              ))}
                              <Badge colorScheme={getDifficultyColor(topic.difficulty)}>
                                {topic.difficulty}
                              </Badge>
                            </Flex>
                          </Box>
                        </Flex>
                        
                        <Text fontSize="sm" mb={4}>
                          {topic.description}
                        </Text>
                        
                        <Flex wrap="wrap" gap={2} mb={2}>
                          {topic.tags.map((tag) => (
                            <Tag key={tag} size="sm" variant="subtle">
                              {tag}
                            </Tag>
                          ))}
                        </Flex>
                      </CardBody>
                      
                      <Divider />
                      
                      <CardFooter pt={2} pb={2}>
                        <Button
                          size="sm"
                          variant="ghost"
                          colorScheme="blue"
                          rightIcon={<ChevronRightIcon />}
                          onClick={() => handleTopicClick(topic.id)}
                        >
                          Explore Topic
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </Grid>
                
                {filteredTopics.length === 0 && (
                  <Box
                    p={8}
                    borderWidth="1px"
                    borderRadius="lg"
                    borderColor={borderColor}
                    textAlign="center"
                  >
                    <Heading size="md" mb={2}>No topics found</Heading>
                    <Text mb={4}>Try adjusting your search or filter criteria.</Text>
                    <Button colorScheme="blue" onClick={clearFilters}>Clear All Filters</Button>
                  </Box>
                )}
              </GridItem>
            </Grid>
          </TabPanel>
          
          {/* Algorithms Tab Panel */}
          <TabPanel p={0} pt={4}>
            <VStack spacing={4} align="stretch">
              {algorithms.map((algo) => (
                <Card key={algo.id} variant="outline">
                  <CardBody>
                    <Heading size="md" mb={2}>{algo.name}</Heading>
                    <Text mb={4}>{algo.description}</Text>
                    
                    <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4}>
                      <Box>
                        <Heading size="sm" mb={2}>Advantages</Heading>
                        <List spacing={1}>
                          {algo.advantages.map((adv, idx) => (
                            <ListItem key={idx}>• {adv}</ListItem>
                          ))}
                        </List>
                      </Box>
                      
                      <Box>
                        <Heading size="sm" mb={2}>Limitations</Heading>
                        <List spacing={1}>
                          {algo.limitations.map((lim, idx) => (
                            <ListItem key={idx}>• {lim}</ListItem>
                          ))}
                        </List>
                      </Box>
                    </Grid>
                  </CardBody>
                  
                  <Divider />
                  
                  <CardFooter>
                    <HStack spacing={3}>
                      <Text fontSize="sm" color="gray.500">
                        <strong>Paper:</strong> {algo.paper}, {algo.authors} ({algo.year})
                      </Text>
                      <Button
                        size="sm"
                        rightIcon={<ExternalLinkIcon />}
                        colorScheme="blue"
                        variant="ghost"
                      >
                        View Implementation
                      </Button>
                    </HStack>
                  </CardFooter>
                </Card>
              ))}
            </VStack>
          </TabPanel>
          
          {/* Tutorials Tab Panel */}
          <TabPanel p={0} pt={4}>
            <Grid templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }} gap={4}>
              <Card variant="outline">
                <CardBody>
                  <Heading size="md" mb={2}>Building Your First FL System</Heading>
                  <Text fontSize="sm" mb={3}>
                    A step-by-step tutorial for implementing federated learning with TensorFlow Federated.
                  </Text>
                  <HStack>
                    <Badge colorScheme="green">Beginner</Badge>
                    <Badge colorScheme="blue">TensorFlow</Badge>
                  </HStack>
                </CardBody>
                <Divider />
                <CardFooter>
                  <Button
                    rightIcon={<ChevronRightIcon />}
                    colorScheme="blue"
                    size="sm"
                  >
                    Start Tutorial
                  </Button>
                </CardFooter>
              </Card>
              
              <Card variant="outline">
                <CardBody>
                  <Heading size="md" mb={2}>Differential Privacy in FL</Heading>
                  <Text fontSize="sm" mb={3}>
                    Learn how to implement differential privacy in federated learning environments.
                  </Text>
                  <HStack>
                    <Badge colorScheme="orange">Intermediate</Badge>
                    <Badge colorScheme="red">Privacy</Badge>
                  </HStack>
                </CardBody>
                <Divider />
                <CardFooter>
                  <Button
                    rightIcon={<ChevronRightIcon />}
                    colorScheme="blue"
                    size="sm"
                  >
                    Start Tutorial
                  </Button>
                </CardFooter>
              </Card>
            </Grid>
          </TabPanel>
          
          {/* Resources Tab Panel */}
          <TabPanel p={0} pt={4}>
            <Grid templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }} gap={4}>
              <Card variant="outline">
                <CardBody>
                  <Heading size="md" mb={2}>Research Papers</Heading>
                  <Text mb={3}>
                    Access curated collections of seminal papers in federated learning research.
                  </Text>
                </CardBody>
                <CardFooter>
                  <Button
                    rightIcon={<ExternalLinkIcon />}
                    colorScheme="blue"
                  >
                    Browse Papers
                  </Button>
                </CardFooter>
              </Card>
              
              <Card variant="outline">
                <CardBody>
                  <Heading size="md" mb={2}>Open Source Libraries</Heading>
                  <Text mb={3}>
                    Explore popular frameworks and libraries for federated learning implementation.
                  </Text>
                </CardBody>
                <CardFooter>
                  <Button
                    rightIcon={<ExternalLinkIcon />}
                    colorScheme="blue"
                  >
                    View Libraries
                  </Button>
                </CardFooter>
              </Card>
              
              <Card variant="outline">
                <CardBody>
                  <Heading size="md" mb={2}>Datasets</Heading>
                  <Text mb={3}>
                    Find benchmark datasets specifically designed for federated learning research.
                  </Text>
                </CardBody>
                <CardFooter>
                  <Button
                    rightIcon={<ExternalLinkIcon />}
                    colorScheme="blue"
                  >
                    Access Datasets
                  </Button>
                </CardFooter>
              </Card>
            </Grid>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Container>
  );
};

export default CompendiumPage;