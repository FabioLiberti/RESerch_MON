import React, { useState } from 'react';
import {
  Box,
  Container,
  Heading,
  Text,
  Button,
  Flex,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Card,
  Stack,
  Badge,
  HStack,
  VStack,
  Progress,
  Icon,
  Divider,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  useColorModeValue
} from '@chakra-ui/react';
import { ChevronRightIcon } from '@chakra-ui/icons';
import { 
  FiBook, 
  FiActivity, 
  FiBookmark, 
  FiUsers,
  FiClock,
  FiAward,
  FiUserCheck
} from 'react-icons/fi';
import LearningPathComponent from '../components/learning/LearningPathComponent';

// Define available learning paths
interface LearningPathSummary {
  id: string;
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedHours: number;
  categories: string[];
  enrolledUsers: number;
  completion: number; // User's completion percentage (0-100)
}

const learningPaths: LearningPathSummary[] = [
  {
    id: 'fl-fundamentals',
    title: 'Federated Learning Fundamentals',
    description: 'Master the core concepts and algorithms of federated learning',
    difficulty: 'beginner',
    estimatedHours: 15,
    categories: ['basics', 'algorithms'],
    enrolledUsers: 2435,
    completion: 33 // User has completed 33% of this path
  },
  {
    id: 'privacy-advanced',
    title: 'Privacy in Federated Learning',
    description: 'Deep dive into privacy-preserving techniques for federated learning',
    difficulty: 'advanced',
    estimatedHours: 20,
    categories: ['privacy', 'algorithms'],
    enrolledUsers: 1254,
    completion: 0 // User hasn't started this path
  },
  {
    id: 'fl-applications',
    title: 'Applied Federated Learning',
    description: 'Real-world applications and case studies of federated learning',
    difficulty: 'intermediate',
    estimatedHours: 12,
    categories: ['applications', 'systems'],
    enrolledUsers: 1876,
    completion: 0 // User hasn't started this path
  },
  {
    id: 'fl-edge',
    title: 'Edge Deployment of Federated Learning',
    description: 'Implementing federated learning on edge and IoT devices',
    difficulty: 'intermediate',
    estimatedHours: 18,
    categories: ['systems', 'applications'],
    enrolledUsers: 945,
    completion: 0 // User hasn't started this path
  }
];

// Get difficulty color scheme
const getDifficultyColorScheme = (difficulty: string): string => {
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

const LearningPathPage: React.FC = () => {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const cardBg = useColorModeValue('white', 'gray.800');
  const categoryBg = useColorModeValue('gray.100', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.700');

  const handlePathSelect = (pathId: string) => {
    setSelectedPath(pathId);
    window.history.pushState(null, "", `/learning-path/${pathId}`);
  };

  const handleBackToList = () => {
    setSelectedPath(null);
    window.history.pushState(null, "", "/learning-path");
  };

  return (
    <Container maxW="container.xl" py={5}>
      <Box mb={5}>
        <Breadcrumb separator={<ChevronRightIcon color="gray.500" />}>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbItem>
            <BreadcrumbLink href="/compendium">Compendium</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbItem isCurrentPage>
            <BreadcrumbLink href="/learning-path">Learning Paths</BreadcrumbLink>
          </BreadcrumbItem>
        </Breadcrumb>
      </Box>

      {!selectedPath ? (
        <>
          <Flex justifyContent="space-between" alignItems="center" mb={6}>
            <Heading as="h1" size="xl">
              Learning Paths
            </Heading>
            <Button variant="outline" colorScheme="blue">
              Filter Paths
            </Button>
          </Flex>

          <Text fontSize="lg" mb={6}>
            Follow guided learning journeys to master different aspects of federated learning. 
            Each path consists of curated topics, exercises, and assessments.
          </Text>

          <Tabs variant="line" colorScheme="blue" mb={6}>
            <TabList>
              <Tab><Icon as={FiBook as React.ElementType} mr={2} /> All Paths</Tab>
              <Tab><Icon as={FiActivity as React.ElementType} mr={2} /> In Progress</Tab>
              <Tab><Icon as={FiBookmark as React.ElementType} mr={2} /> Bookmarked</Tab>
              <Tab><Icon as={FiUsers as React.ElementType} mr={2} /> Popular</Tab>
            </TabList>

            <TabPanels mt={4}>
              <TabPanel p={0}>
                <VStack spacing={4} align="stretch">
                  {learningPaths.map((path) => (
                    <Card 
                      key={path.id} 
                      p={5} 
                      variant="outline"
                      bg={cardBg}
                      borderColor={borderColor}
                      cursor="pointer"
                      _hover={{ 
                        transform: 'translateY(-4px)', 
                        shadow: 'md',
                        borderColor: 'blue.400'
                      }}
                      transition="all 0.2s"
                      onClick={() => handlePathSelect(path.id)}
                    >
                      <Flex direction={["column", "column", "row"]} justify="space-between">
                        <Box flex="1">
                          <Heading as="h2" size="md" mb={2}>
                            {path.title}
                          </Heading>
                          <Text mb={3}>
                            {path.description}
                          </Text>
                          
                          <HStack mb={3} wrap="wrap">
                            {path.categories.map((category) => (
                              <Badge 
                                key={category} 
                                bg={categoryBg} 
                                px={2} 
                                py={1} 
                                borderRadius="md"
                              >
                                {category}
                              </Badge>
                            ))}
                          </HStack>
                          
                          <HStack spacing={4} mb={2} wrap="wrap">
                            <HStack>
                              <Icon as={FiAward as React.ElementType} color={
                                path.difficulty === 'beginner' ? 'green.500' : 
                                path.difficulty === 'intermediate' ? 'orange.500' : 'red.500'
                              } />
                              <Text fontSize="sm">
                                <strong>Difficulty:</strong>{' '}
                                <Badge colorScheme={getDifficultyColorScheme(path.difficulty)}>
                                  {path.difficulty}
                                </Badge>
                              </Text>
                            </HStack>
                            
                            <HStack>
                              <Icon as={FiClock as React.ElementType} color="blue.500" />
                              <Text fontSize="sm">
                                <strong>Time:</strong> {path.estimatedHours} hours
                              </Text>
                            </HStack>
                            
                            <HStack>
                              <Icon as={FiUserCheck as React.ElementType} color="purple.500" />
                              <Text fontSize="sm">
                                <strong>Enrolled:</strong> {path.enrolledUsers.toLocaleString()}
                              </Text>
                            </HStack>
                          </HStack>
                        </Box>
                        
                        <Flex 
                          direction="column" 
                          align={["flex-start", "flex-start", "flex-end"]}
                          justify="space-between"
                          mt={[4, 4, 0]}
                          minW={["100%", "100%", "150px"]}
                        >
                          <Button 
                            colorScheme="blue"
                            variant={path.completion > 0 ? "solid" : "outline"}
                            size="md"
                            width={["100%", "auto"]}
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePathSelect(path.id);
                            }}
                          >
                            {path.completion > 0 ? "Continue" : "Start Path"}
                          </Button>
                          
                          {path.completion > 0 && (
                            <Box mt={4} w="100%">
                              <Text fontSize="sm" textAlign={["left", "left", "right"]}>
                                {path.completion}% complete
                              </Text>
                              <Progress 
                                value={path.completion} 
                                size="sm" 
                                colorScheme="green" 
                                mt={1}
                                borderRadius="full"
                              />
                            </Box>
                          )}
                        </Flex>
                      </Flex>
                    </Card>
                  ))}
                </VStack>
              </TabPanel>

              <TabPanel p={0}>
                <VStack spacing={4} align="stretch">
                  {learningPaths
                    .filter(path => path.completion > 0)
                    .map((path) => (
                      <Card 
                        key={path.id} 
                        p={5} 
                        variant="outline" 
                        cursor="pointer"
                        onClick={() => handlePathSelect(path.id)}
                        _hover={{ shadow: 'md', borderColor: 'blue.400' }}
                      >
                        <Heading as="h3" size="md" mb={2}>
                          {path.title}
                        </Heading>
                        <Text fontSize="sm" mb={2}>Your progress: {path.completion}%</Text>
                        <Progress 
                          value={path.completion} 
                          size="sm" 
                          colorScheme="green" 
                          borderRadius="full"
                        />
                      </Card>
                    ))}
                  {learningPaths.filter(path => path.completion > 0).length === 0 && (
                    <Box 
                      p={6} 
                      textAlign="center" 
                      borderWidth="1px" 
                      borderRadius="lg"
                      borderStyle="dashed"
                    >
                      <Text>
                        You don't have any learning paths in progress. Start one from the All Paths tab!
                      </Text>
                    </Box>
                  )}
                </VStack>
              </TabPanel>

              <TabPanel p={0}>
                <Box 
                  p={6} 
                  textAlign="center" 
                  borderWidth="1px" 
                  borderRadius="lg"
                  borderStyle="dashed"
                >
                  <Text>
                    You don't have any bookmarked learning paths yet.
                  </Text>
                </Box>
              </TabPanel>

              <TabPanel p={0}>
                <VStack spacing={4} align="stretch">
                  {learningPaths
                    .sort((a, b) => b.enrolledUsers - a.enrolledUsers)
                    .map((path) => (
                      <Card 
                        key={path.id} 
                        p={5} 
                        variant="outline" 
                        cursor="pointer"
                        onClick={() => handlePathSelect(path.id)}
                        _hover={{ shadow: 'md', borderColor: 'blue.400' }}
                      >
                        <Heading as="h3" size="md" mb={2}>
                          {path.title}
                        </Heading>
                        <Text mb={3}>
                          {path.description}
                        </Text>
                        <Flex align="center">
                          <Icon as={FiUserCheck as React.ElementType} mr={2} color="purple.500" />
                          <Text fontWeight="bold">
                            {path.enrolledUsers.toLocaleString()} users enrolled
                          </Text>
                        </Flex>
                      </Card>
                    ))}
                </VStack>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </>
      ) : (
        <>
          <Box mb={5}>
            <Button 
              variant="ghost" 
              colorScheme="blue"
              onClick={handleBackToList}
              leftIcon={<ChevronRightIcon transform="rotate(180deg)" />}
            >
              Back to Learning Paths
            </Button>
          </Box>
          <LearningPathComponent />
        </>
      )}
    </Container>
  );
};

export default LearningPathPage;